import os
import subprocess
import json
import random
import wave
import struct
import math
import shutil
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw

# Configuration
RESOLUTION = "1024x576"
TARGET_FPS = 30
MIN_CUT_DURATION = 0.8
MAX_CUT_DURATION = 3.0
NUM_THREADS = 6

def run_cmd(cmd):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error executing command: {' '.join(cmd)}")
        print(f"Stderr: {res.stderr}")
        return False
    return True

def probe_videos():
    print("Probing video files in the sorgenti directory...")
    src_dir = 'sorgenti'
    if not os.path.exists(src_dir):
        print(f"Error: {src_dir} directory does not exist.")
        return []
    all_files = os.listdir(src_dir)
    video_files = []
    
    # Identify video files, excluding SUONO.mp4
    for f in all_files:
        if f.lower().endswith('.mp4'):
            if f == 'SUONO.mp4':
                continue
            video_files.append(f)
            
    probed_videos = []
    for f in video_files:
        full_path = os.path.join(src_dir, f)
        cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', full_path]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            continue
        data = json.loads(res.stdout)
        fmt = data.get('format', {})
        duration = float(fmt.get('duration', 0))
        video_stream = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
        if not video_stream:
            continue
        
        # Get width & height
        width = int(video_stream.get('width', 0))
        height = int(video_stream.get('height', 0))
        
        # Determine aspect ratio
        aspect = width / height if height > 0 else 1.0
        
        probed_videos.append({
            'filename': full_path,
            'duration': duration,
            'width': width,
            'height': height,
            'aspect_ratio': aspect,
            'is_portrait': aspect < 1.2
        })
        print(f"  - Probed {f}: {width}x{height}, duration={duration:.2f}s, portrait={aspect < 1.2}")
        
    return probed_videos

def extract_audio(video_file, wav_file):
    print(f"Extracting audio track from {video_file}...")
    cmd = [
        'ffmpeg', '-y', '-i', video_file,
        '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', wav_file
    ]
    if run_cmd(cmd):
        print(f"  Audio successfully extracted to {wav_file}")
        return True
    return False

def detect_cut_points(wav_file, target_duration, min_cut=0.8, max_cut=3.0):
    print("Analyzing audio wav for peak amplitude onsets...")
    with wave.open(wav_file, 'rb') as w:
        params = w.getparams()
        nframes = params.nframes
        framerate = params.framerate
        frames = w.readframes(nframes)
        
    # Load samples using numpy for performance
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    
    # 100ms frames
    frame_size = int(framerate * 0.10)
    num_frames = len(samples) // frame_size
    
    # Truncate to multiple of frame_size
    samples = samples[:num_frames * frame_size]
    frames_matrix = samples.reshape(-1, frame_size)
    
    # Compute RMS energy for each frame
    energies = np.sqrt(np.mean(frames_matrix**2, axis=1))
    
    # Compute novelty curve (energy difference)
    novelty = np.diff(energies)
    novelty = np.maximum(0.0, novelty)
    novelty = np.insert(novelty, 0, 0.0) # match original length
    
    # Find local peaks
    peaks = []
    max_nov = np.max(novelty) if len(novelty) > 0 else 1.0
    for i in range(1, len(novelty) - 1):
        if novelty[i] > novelty[i-1] and novelty[i] > novelty[i+1]:
            if novelty[i] > 0.08 * max_nov: # Threshold for noise
                peaks.append(i * 0.10) # convert frame index to seconds
                
    print(f"  Found {len(peaks)} initial onset peaks.")
    
    # Select cut points dynamically enforcing spacing constraints
    cut_points = [0.0]
    last_cut = 0.0
    
    while last_cut < target_duration:
        min_next = last_cut + min_cut
        max_next = last_cut + max_cut
        
        if min_next >= target_duration - 0.5:
            break
            
        # Find candidate peaks in the current window
        candidates = [p for p in peaks if min_next <= p <= min(max_next, target_duration - 0.5)]
        
        if candidates:
            # We want to select a peak to cut on. Let's find the strongest one
            # Find the peak value corresponding to each candidate time
            best_time = min_next
            best_val = -1.0
            for c in candidates:
                idx = int(c / 0.1)
                if idx < len(novelty) and novelty[idx] > best_val:
                    best_val = novelty[idx]
                    best_time = c
            next_cut = best_time
        else:
            # If no peak is found in the window, cut at the midpoint of min and max to keep flow dynamic
            next_cut = min(last_cut + (min_cut + max_cut)/2.0, target_duration - 0.5)
            
        cut_points.append(next_cut)
        last_cut = next_cut
        
    cut_points.append(target_duration)
    print(f"  Determined {len(cut_points)-1} cuts over {target_duration:.2f} seconds.")
    return cut_points

class VideoPool:
    def __init__(self, videos):
        self.all_videos = videos
        self.pool = []
        self.reset()
        
    def reset(self):
        self.pool = list(self.all_videos)
        random.shuffle(self.pool)
        
    def get_video_for_duration(self, duration):
        for idx, video in enumerate(self.pool):
            if video['duration'] >= duration:
                return self.pool.pop(idx)
        # If no video in pool is long enough, reset and search
        self.reset()
        for idx, video in enumerate(self.pool):
            if video['duration'] >= duration:
                return self.pool.pop(idx)
        # Absolute fallback: return the longest video
        return max(self.all_videos, key=lambda x: x['duration'])

def render_subclip(args):
    idx, video_path, start_time, duration, output_path, is_portrait = args
    
    if is_portrait:
        # Professional blurred background filter for portrait videos
        filter_complex = (
            "[0:v]scale=1024:576:force_original_aspect_ratio=increase,crop=1024:576,boxblur=20:5[bg];"
            "[0:v]scale=-2:576[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1[out]"
        )
        cmd = [
            'ffmpeg', '-y', '-ss', f"{start_time:.3f}", '-t', f"{duration:.3f}",
            '-i', video_path, '-filter_complex', filter_complex, '-map', '[out]',
            '-r', str(TARGET_FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', output_path
        ]
    else:
        # Standard scale-and-pad filter for landscape videos to fit RESOLUTION exactly
        vf = f"scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(1024-iw)/2:(576-ih)/2,setsar=1"
        cmd = [
            'ffmpeg', '-y', '-ss', f"{start_time:.3f}", '-t', f"{duration:.3f}",
            '-i', video_path, '-vf', vf,
            '-r', str(TARGET_FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', output_path
        ]
        
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return idx, False, res.stderr
    return idx, True, ""

def render_intro(output_path):
    print("Generating intro animation frame-by-frame...")
    intro_dir = "temp_intro_frames"
    if os.path.exists(intro_dir):
        shutil.rmtree(intro_dir)
    os.makedirs(intro_dir)
    
    # Load images from sorgenti
    img1 = Image.open(os.path.join('sorgenti', '1 (1).jpg'))
    img2 = Image.open(os.path.join('sorgenti', '1 (2).jpg'))
    
    # Scale both images to fit height 576 (800x600 -> 768x576)
    target_h = 576
    target_w = 768
    
    try:
        resample_filter = Image.Resampling.LANCZOS
    except AttributeError:
        resample_filter = Image.LANCZOS
        
    img1_scaled = img1.resize((target_w, target_h), resample_filter)
    img2_scaled = img2.resize((target_w, target_h), resample_filter)
    
    # Coordinates in canvas
    pad_left = (1024 - target_w) // 2 # 128
    
    # Mouse path coordinates (canvas space)
    # Start bottom right
    start_x, start_y = 900, 500
    # Center of diff (mapped to canvas): (512, 273)
    end_x, end_y = 512, 273
    
    def draw_cursor(draw_obj, cx, cy):
        # Coordinates relative to cursor point (cx, cy)
        points = [
            (cx, cy),
            (cx, cy + 17),
            (cx + 4, cy + 13),
            (cx + 8, cy + 22),
            (cx + 11, cy + 21),
            (cx + 7, cy + 12),
            (cx + 12, cy + 12)
        ]
        draw_obj.polygon(points, fill='white', outline='black')
        
    fps = 30
    duration = 3.0
    total_frames = int(duration * fps) # 90 frames
    
    for f in range(total_frames):
        # Create a black canvas
        canvas = Image.new('RGB', (1024, 576), (0, 0, 0))
        
        # Frame 0 to 30 (1s): show img2 (1 (2).jpg) - before hover
        # Frame 30 to 90 (1s to 3s): show img1 (1 (1).jpg) - after hover
        if f < 30:
            canvas.paste(img2_scaled, (pad_left, 0))
        else:
            canvas.paste(img1_scaled, (pad_left, 0))
            
        # Draw mouse cursor
        draw_cursor_on_frame = True
        
        if f < 30:
            t = f / 30.0
            t_smooth = t * t * (3.0 - 2.0 * t) # smoothstep
            cur_x = start_x + (end_x - start_x) * t_smooth
            cur_y = start_y + (end_y - start_y) * t_smooth
        elif f < 45:
            cur_x, cur_y = end_x, end_y
        elif f < 60:
            t = (f - 45) / 15.0
            t_smooth = t * t # accelerate
            cur_x = end_x
            cur_y = end_y + (600 - end_y) * t_smooth
        else:
            draw_cursor_on_frame = False
            
        if draw_cursor_on_frame:
            draw = ImageDraw.Draw(canvas)
            draw_cursor(draw, int(cur_x), int(cur_y))
            
        canvas.save(os.path.join(intro_dir, f"frame_{f:03d}.png"))
        
    # Compile to MP4
    cmd = [
        'ffmpeg', '-y', '-framerate', '30', '-i', os.path.join(intro_dir, 'frame_%03d.png'),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', output_path
    ]
    if run_cmd(cmd):
        print(f"  Intro video successfully rendered to {output_path}")
        shutil.rmtree(intro_dir)
        return True
    return False

def main():
    print("=== DYNAMIC MONTAGE GENERATOR START ===")
    
    # 1. Probe source videos
    videos = probe_videos()
    if not videos:
        print("Error: No source videos found in the workspace.")
        return
        
    suono_path = os.path.join('sorgenti', 'SUONO.mp4')
    if not os.path.exists(suono_path):
        print(f"Error: {suono_path} is missing. It is required for the audio track.")
        return
        
    # 2. Extract and analyze audio
    temp_wav = "temp_audio.wav"
    if not extract_audio(suono_path, temp_wav):
        return
        
    with wave.open(temp_wav, 'rb') as w:
        total_audio_duration = w.getnframes() / w.getframerate()
        
    intro_duration = 3.0
    montage_duration = total_audio_duration - intro_duration
    cut_points = detect_cut_points(temp_wav, montage_duration, MIN_CUT_DURATION, MAX_CUT_DURATION)
    
    # 3. Plan sub-clips
    temp_dir = "temp_clips"
    if os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir)
        except Exception:
            pass
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    
    render_tasks = []
    
    print("Planning clip sequence with smart separation and priority for 5 and 6...")
    last_file = None
    last_portrait = False
    
    # Track how recently each video was used (to prevent reuse too quickly)
    last_used_idx = {v['filename']: -999 for v in videos}
    
    # Track usage counts
    usage_counts = {v['filename']: 0 for v in videos}
    
    random.seed(42)  # Seed to ensure predictable but highly dynamic results
    
    for i in range(len(cut_points) - 1):
        t_start = cut_points[i]
        t_end = cut_points[i+1]
        duration = t_end - t_start
        
        # Find candidates that are long enough and respect constraints
        candidates = []
        for v in videos:
            if v['duration'] < duration:
                continue
            if v['filename'] == last_file:
                continue
            if v['is_portrait'] and last_portrait:
                continue
            candidates.append(v)
            
        if not candidates:
            # Fallback 1: relax portrait constraint
            candidates = [v for v in videos if v['duration'] >= duration and v['filename'] != last_file]
            if not candidates:
                # Fallback 2: relax identical video constraint (just select the longest video)
                longest = max(videos, key=lambda x: x['duration'])
                candidates = [longest]
                
        # Score candidates to select the best one
        best_candidate = None
        best_score = -9999.0
        
        for c in candidates:
            score = 0.0
            filename = c['filename']
            
            # Boost priority for VIDEO INSTALLAZIONE 5.mp4 and 6.mp4
            if any(filename.endswith(name) for name in ['VIDEO INSTALLAZIONE 5.mp4', 'VIDEO INSTALLAZIONE 6.mp4']):
                score += 15.0
                if duration > 1.5:
                    score += 5.0
            
            # Distance since last used (penalize if used too recently)
            distance = i - last_used_idx[filename]
            if distance < 3:
                score -= 10.0
            else:
                score += min(distance, 10) * 1.0
                
            # Usage penalty (to keep overall variety of other clips)
            if not any(filename.endswith(name) for name in ['VIDEO INSTALLAZIONE 5.mp4', 'VIDEO INSTALLAZIONE 6.mp4']):
                score -= usage_counts[filename] * 2.0
            else:
                # Lower penalty for 5 and 6 so they are selected more frequently
                score -= usage_counts[filename] * 0.5
                
            # Minor randomness to vary the choices
            score += random.uniform(0, 1.0)
            
            if score > best_score:
                best_score = score
                best_candidate = c
                
        video = best_candidate
        filename = video['filename']
        
        # Pick a random start position in the source video
        min_start = 0.0
        if filename.endswith('VIDEO INSTALLAZIONE7.mp4'):
            min_start = 5.0
            
        max_start = video['duration'] - duration
        if max_start > min_start:
            video_start = random.uniform(min_start, max_start)
        else:
            video_start = min_start
            
        output_file = os.path.join(temp_dir, f"clip_{i:03d}.mp4")
        
        # Task format: (index, source_path, start_time, duration, output_path, is_portrait)
        render_tasks.append((
            i,
            filename,
            video_start,
            duration,
            output_file,
            video['is_portrait']
        ))
        
        # Update trackers
        last_file = filename
        last_portrait = video['is_portrait']
        last_used_idx[filename] = i
        usage_counts[filename] += 1
        
    print("Planned clip sequence. Video usage counts:")
    for k, count in usage_counts.items():
        print(f"  - {os.path.basename(k)}: used {count} times")
    print(f"Planned {len(render_tasks)} clips.")
    
    # 4. Render sub-clips in parallel
    print(f"Rendering sub-clips in parallel using {NUM_THREADS} threads...")
    success_count = 0
    with ThreadPoolExecutor(max_workers=NUM_THREADS) as executor:
        results = list(executor.map(render_subclip, render_tasks))
        
    for idx, success, err in results:
        task_info = render_tasks[idx]
        if success:
            success_count += 1
        else:
            print(f"  FAILED to render clip {idx} ({task_info[1]}): {err}")
            
    print(f"Rendered {success_count}/{len(render_tasks)} clips successfully.")
    if success_count < len(render_tasks):
        print("Error: Some clips failed to render. Aborting.")
        return
        
    # 4b. Render the intro animation
    temp_intro = "temp_intro.mp4"
    if not render_intro(temp_intro):
        print("Error rendering intro video.")
        return
        
    # 5. Concatenate sub-clips
    print("Assembling the sub-clips...")
    concat_file = "temp_concat_list.txt"
    with open(concat_file, "w", encoding="utf-8") as f:
        # Prepend the intro video to the list
        f.write(f"file '{temp_intro}'\n")
        for task in render_tasks:
            # ffmpeg concat demuxer requires forward slashes or escaped backslashes
            path = task[4].replace("\\", "/")
            f.write(f"file '{path}'\n")
            
    temp_concat_video = "temp_concatenated.mp4"
    print("Concatenating video tracks...")
    cmd_concat = [
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_file,
        '-c', 'copy', temp_concat_video
    ]
    if not run_cmd(cmd_concat):
        print("Error during video concatenation.")
        return
        
    # 6. Merge audio
    final_output = "montaggio_dinamico.mp4"
    print(f"Adding soundtrack from {suono_path} to create {final_output}...")
    cmd_merge = [
        'ffmpeg', '-y', '-i', temp_concat_video, '-i', suono_path,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-shortest', final_output
    ]
    if not run_cmd(cmd_merge):
        print("Error merging audio track.")
        return
        
    # 7. Clean up
    print("Cleaning up temporary files...")
    try:
        os.remove(temp_wav)
        os.remove(concat_file)
        os.remove(temp_concat_video)
        os.remove(temp_intro)
        shutil.rmtree(temp_dir)
        print("  Cleanup completed successfully.")
    except Exception as e:
        print(f"  Error during cleanup: {e}")
        
    print(f"\nSUCCESS! Dynamic montage generated successfully: {final_output}")
    print("=== DYNAMIC MONTAGE GENERATOR END ===")

if __name__ == "__main__":
    main()
