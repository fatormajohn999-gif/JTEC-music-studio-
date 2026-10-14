#!/usr/bin/env python3
import sys, math, subprocess

width, height = 1280, 720
fps = 30
duration = 4  # 4 seconds loop = 120 frames
total_frames = fps * duration

output_file = 'public/walking_cinematic_wide.mp4'

cmd = [
    'ffmpeg', '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
    '-s', f'{width}x{height}', '-pix_fmt', 'rgb24', '-r', str(fps),
    '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-an', output_file
]

proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

# Pre-generate static city skyline
buildings = [
    (0, 380, 90, 480),
    (75, 420, 80, 480),
    (140, 320, 110, 480),
    (235, 400, 75, 480),
    (290, 350, 130, 480),
    (400, 390, 95, 480),
    (480, 290, 120, 480),
    (585, 370, 100, 480),
    (670, 330, 115, 480),
    (770, 410, 85, 480),
    (840, 310, 135, 480),
    (960, 380, 90, 480),
    (1035, 340, 125, 480),
    (1145, 400, 100, 480),
    (1230, 360, 90, 480),
]

# Random seeds for stars / window lights
import random
random.seed(42)
stars = [(random.randint(0, width - 1), random.randint(20, 320), random.random()) for _ in range(80)]
windows = []
for bx, by, bw, bbot in buildings:
    for wx in range(bx + 12, bx + bw - 12, 16):
        for wy in range(by + 20, bbot - 30, 22):
            if random.random() < 0.28:
                windows.append((wx, wy, random.choice([(255, 220, 150), (160, 210, 255), (255, 180, 120)])))

ground_y = 480

for f in range(total_frames):
    t = f / total_frames
    phase = t * 2 * math.pi
    
    # 2D frame buffer
    frame = bytearray(width * height * 3)
    
    # 1. Sky & Ground Gradient
    for y in range(height):
        if y < ground_y:
            # Night sky: dark navy to slightly lighter near horizon
            ky = y / ground_y
            r = int(5 + ky * 14)
            g = int(8 + ky * 20)
            b = int(18 + ky * 35)
        else:
            # Wet asphalt pavement
            ky = (y - ground_y) / (height - ground_y)
            r = int(7 + (1 - ky) * 10)
            g = int(10 + (1 - ky) * 14)
            b = int(16 + (1 - ky) * 22)
            
        row_start = y * width * 3
        # Fast row fill
        row_bytes = bytes([r, g, b]) * width
        frame[row_start : row_start + width * 3] = row_bytes

    # Draw stars
    for sx, sy, sb in stars:
        tw = (math.sin(phase * 2 + sx * 0.1) * 0.3 + 0.7) * sb
        idx = (sy * width + sx) * 3
        if 0 <= idx < len(frame) - 2:
            frame[idx] = min(255, int(frame[idx] + 160 * tw))
            frame[idx+1] = min(255, int(frame[idx+1] + 180 * tw))
            frame[idx+2] = min(255, int(frame[idx+2] + 240 * tw))

    # Draw distant skyline buildings
    for bx, by, bw, bbot in buildings:
        for by_pos in range(by, bbot):
            for bx_pos in range(max(0, bx), min(width, bx + bw)):
                idx = (by_pos * width + bx_pos) * 3
                frame[idx] = 12
                frame[idx+1] = 16
                frame[idx+2] = 28

    # Draw building windows
    for wx, wy, (wr, wg, wb) in windows:
        if 0 <= wx < width - 4 and 0 <= wy < height - 6:
            for dx in range(3):
                for dy in range(4):
                    idx = ((wy + dy) * width + (wx + dx)) * 3
                    frame[idx] = wr
                    frame[idx+1] = wg
                    frame[idx+2] = wb

    # Horizon curb line
    for x in range(width):
        idx = (ground_y * width + x) * 3
        frame[idx] = 45
        frame[idx+1] = 55
        frame[idx+2] = 75

    # 2. Moving Streetlamps & Warm Light Pools (smooth loop across screen)
    lamp_spacing = 380
    lamp_offset = (t * lamp_spacing) % lamp_spacing
    for i in range(-1, 5):
        lx = int(i * lamp_spacing + lamp_offset)
        if -80 <= lx <= width + 80:
            ly = 360
            # Light pool on pavement
            for py in range(ground_y, ground_y + 160):
                dy = (py - ground_y) / 160
                for px in range(max(0, lx - 140), min(width, lx + 140)):
                    dx = abs(px - lx) / 140
                    dist = math.sqrt(dx * dx + dy * dy * 2.5)
                    if dist < 1.0:
                        glow = (1.0 - dist) * 0.45
                        p_idx = (py * width + px) * 3
                        frame[p_idx] = min(255, int(frame[p_idx] + 250 * glow))
                        frame[p_idx+1] = min(255, int(frame[p_idx+1] + 200 * glow))
                        frame[p_idx+2] = min(255, int(frame[p_idx+2] + 120 * glow))
            
            # Lamp pole
            if 0 <= lx < width:
                for py in range(ly, ground_y):
                    p_idx = (py * width + lx) * 3
                    frame[p_idx] = 40
                    frame[p_idx+1] = 45
                    frame[p_idx+2] = 60
                # Lamp lantern
                for dy in range(-8, 8):
                    for dx in range(-8, 8):
                        px = lx + dx
                        py = ly + dy
                        if 0 <= px < width and 0 <= py < height:
                            if dx*dx + dy*dy <= 40:
                                p_idx = (py * width + px) * 3
                                frame[p_idx] = 255
                                frame[p_idx+1] = 240
                                frame[p_idx+2] = 190

    # 3. Cinematic Walking Figure Silhouette
    # Walks across from left-center or centered with camera tracking
    # Camera tracks with walker centered at x = 640
    walker_cx = 640
    
    # Natural 2-step walk cycle per second = 8 steps over 4 seconds
    walk_cycle = phase * 4
    bob = math.sin(walk_cycle * 2) * 4
    walker_base_y = ground_y + 35 + bob
    
    # Head
    head_y = walker_base_y - 145
    for dy in range(-14, 14):
        for dx in range(-11, 11):
            if dx*dx/121 + dy*dy/196 <= 1.0:
                px = int(walker_cx + dx)
                py = int(head_y + dy)
                if 0 <= px < width and 0 <= py < height:
                    p_idx = (py * width + px) * 3
                    frame[p_idx] = 6
                    frame[p_idx+1] = 8
                    frame[p_idx+2] = 14

    # Torso & Coat
    coat_swing = math.sin(walk_cycle) * 5
    for dy in range(0, 75):
        y_pos = int(head_y + 14 + dy)
        half_w = 12 + int(dy * 0.18)
        slant = int((dy / 75) * coat_swing * 0.5)
        for dx in range(-half_w + slant, half_w + slant):
            px = int(walker_cx + dx)
            py = y_pos
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = 4
                frame[p_idx+1] = 6
                frame[p_idx+2] = 10

    # Legs walking cycle
    leg1_swing = math.sin(walk_cycle) * 22
    leg2_swing = math.sin(walk_cycle + math.pi) * 22
    
    for dy in range(0, 60):
        py = int(head_y + 88 + dy)
        f_ratio = dy / 60
        # Leg 1
        px1 = int(walker_cx - 6 + leg1_swing * f_ratio)
        for w in range(-4, 5):
            px = px1 + w
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = 4
                frame[p_idx+1] = 6
                frame[p_idx+2] = 10
        # Leg 2
        px2 = int(walker_cx + 6 + leg2_swing * f_ratio)
        for w in range(-4, 5):
            px = px2 + w
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = 5
                frame[p_idx+1] = 7
                frame[p_idx+2] = 11

    # Swinging Arms
    arm1_swing = math.sin(walk_cycle + math.pi) * 16
    arm2_swing = math.sin(walk_cycle) * 16
    for dy in range(0, 48):
        py = int(head_y + 24 + dy)
        f_ratio = dy / 48
        # Arm 1 (left)
        px1 = int(walker_cx - 16 - arm1_swing * f_ratio)
        for w in range(-3, 4):
            px = px1 + w
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = 4
                frame[p_idx+1] = 6
                frame[p_idx+2] = 10
        # Arm 2 (right)
        px2 = int(walker_cx + 16 + arm2_swing * f_ratio)
        for w in range(-3, 4):
            px = px2 + w
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = 4
                frame[p_idx+1] = 6
                frame[p_idx+2] = 10

    # Wet pavement shadow under walker
    for dy in range(0, 16):
        py = int(walker_base_y + dy)
        for dx in range(-40, 41):
            px = int(walker_cx + dx)
            if 0 <= px < width and 0 <= py < height:
                p_idx = (py * width + px) * 3
                frame[p_idx] = max(0, frame[p_idx] - 30)
                frame[p_idx+1] = max(0, frame[p_idx+1] - 30)
                frame[p_idx+2] = max(0, frame[p_idx+2] - 30)

    proc.stdin.write(frame)

proc.stdin.close()
proc.wait()
print(f"Generated {output_file} successfully! Return code: {proc.returncode}")
