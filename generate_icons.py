#!/usr/bin/env python3
"""
Generate 6 macOS Big Sur style app icons for CRM Buddy Desktop.
Each icon is 1024x1024 PNG with rounded square (squircle) shape and gradient.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import os

SIZE = 1024
CORNER_RATIO = 0.22  # macOS Big Sur corner radius ~22%
CORNER_RADIUS = int(SIZE * CORNER_RATIO)

VARIANTS_DIR = "/Users/danielbrussig/Documents/Entwicklung/CRM Desktop/src-tauri/icons/variants"
THUMBS_DIR = "/Users/danielbrussig/Documents/Entwicklung/CRM Desktop/src-tauri/icons/thumbnails"


def make_gradient(draw, width, height, color1, color2, direction="vertical"):
    """Create a smooth gradient fill."""
    for i in range(height if direction == "vertical" else width):
        ratio = i / (height if direction == "vertical" else width)
        r = int(color1[0] + (color2[0] - color1[0]) * ratio)
        g = int(color1[1] + (color2[1] - color1[1]) * ratio)
        b = int(color1[2] + (color2[2] - color1[2]) * ratio)
        if direction == "vertical":
            draw.line([(0, i), (width, i)], fill=(r, g, b))
        else:
            draw.line([(i, 0), (i, height)], fill=(r, g, b))


def make_radial_gradient(draw, cx, cy, radius, color1, color2, width, height):
    """Create a radial-like gradient (concentric circles)."""
    for r in range(radius, 0, -1):
        ratio = r / radius
        cr = int(color1[0] + (color2[0] - color1[0]) * ratio)
        cg = int(color1[1] + (color2[1] - color1[1]) * ratio)
        cb = int(color1[2] + (color2[2] - color1[2]) * ratio)
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(cr, cg, cb)
        )


def draw_squircle_mask(size, corner_radius):
    """Create a squircle mask (macOS Big Sur style)."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    # Use superellipse formula for squircle
    n = 5  # superellipse exponent (higher = squarer)
    cx, cy = size / 2, size / 2
    a = (size - 2 * 8) / 2  # half-width with small margin

    pixels = mask.load()
    for y in range(size):
        for x in range(size):
            # Normalize to -1..1
            nx = (x - cx) / a
            ny = (y - cy) / a
            # Superellipse: |x|^n + |y|^n <= 1
            val = (abs(nx) ** n + abs(ny) ** n)
            if val <= 1.0:
                # Anti-aliasing at the edge
                edge_dist = 1.0 - val
                if edge_dist > 0.02:
                    pixels[x, y] = 255
                else:
                    pixels[x, y] = max(0, min(255, int(255 * edge_dist / 0.02)))

    # Actually, pixel-by-pixel is slow for 1024. Use a simpler rounded rect approach.
    return mask


def draw_rounded_rect_mask(size, corner_radius):
    """Create a rounded rectangle mask."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    margin = 0
    draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=corner_radius,
        fill=255,
    )
    return mask


def create_icon_base(color1, color2, gradient_dir="vertical"):
    """Create the base icon with gradient and squircle mask."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fill with gradient
    make_gradient(draw, SIZE, SIZE, color1, color2, gradient_dir)

    # Apply squircle mask
    mask = draw_rounded_rect_mask(SIZE, CORNER_RADIUS)
    result = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    result.paste(img, mask=mask)

    return result


def draw_car_silhouette(draw, cx, cy, scale=1.0, color=(255, 255, 255)):
    """Draw a simple, modern car silhouette."""
    s = scale
    # Car body (main rectangle with rounded top)
    body_left = cx - int(60 * s)
    body_right = cx + int(60 * s)
    body_top = cy - int(10 * s)
    body_bottom = cy + int(15 * s)

    # Lower body
    draw.rounded_rectangle(
        [body_left, body_top, body_right, body_bottom],
        radius=int(8 * s),
        fill=color,
    )

    # Cabin/roof (upper part)
    cabin_left = cx - int(35 * s)
    cabin_right = cx + int(40 * s)
    cabin_top = cy - int(30 * s)
    cabin_bottom = body_top + int(5 * s)
    draw.rounded_rectangle(
        [cabin_left, cabin_top, cabin_right, cabin_bottom],
        radius=int(10 * s),
        fill=color,
    )

    # Windows (dark cutout)
    win_color = (*color[:3], 80) if len(color) == 4 else (0, 0, 80, 120)
    # Use a slightly darker shade
    win_color = tuple(max(0, c - 100) for c in color[:3]) + (180,)
    draw.rounded_rectangle(
        [cabin_left + int(5 * s), cabin_top + int(4 * s),
         cabin_right - int(5 * s), cabin_bottom - int(3 * s)],
        radius=int(6 * s),
        fill=win_color,
    )

    # Wheels
    wheel_r = int(12 * s)
    wheel_y = body_bottom + int(2 * s)
    draw.ellipse(
        [cx - int(40 * s) - wheel_r, wheel_y - wheel_r,
         cx - int(40 * s) + wheel_r, wheel_y + wheel_r],
        fill=color,
    )
    draw.ellipse(
        [cx + int(40 * s) - wheel_r, wheel_y - wheel_r,
         cx + int(40 * s) + wheel_r, wheel_y + wheel_r],
        fill=color,
    )

    # Wheel inner (darker)
    inner_r = int(6 * s)
    draw.ellipse(
        [cx - int(40 * s) - inner_r, wheel_y - inner_r,
         cx - int(40 * s) + inner_r, wheel_y + inner_r],
        fill=win_color,
    )
    draw.ellipse(
        [cx + int(40 * s) - inner_r, wheel_y - inner_r,
         cx + int(40 * s) + inner_r, wheel_y + inner_r],
        fill=win_color,
    )


def draw_key(draw, cx, cy, scale=1.0, color=(255, 255, 255, 230)):
    """Draw a modern key symbol."""
    s = scale
    # Key head (circle)
    head_r = int(22 * s)
    draw.ellipse(
        [cx - head_r, cy - head_r - int(20 * s),
         cx + head_r, cy + head_r - int(20 * s)],
        fill=color,
    )
    # Key hole
    hole_r = int(8 * s)
    draw.ellipse(
        [cx - hole_r, cy - hole_r - int(20 * s),
         cx + hole_r, cy + hole_r - int(20 * s)],
        fill=(0, 0, 0, 80),
    )

    # Key shaft
    shaft_w = int(10 * s)
    shaft_top = cy + head_r - int(20 * s)
    shaft_bottom = cy + int(50 * s)
    draw.rectangle(
        [cx - shaft_w // 2, shaft_top, cx + shaft_w // 2, shaft_bottom],
        fill=color,
    )

    # Key teeth (2 teeth on the right side)
    tooth_w = int(15 * s)
    tooth_h = int(8 * s)
    for i, offset in enumerate([int(15 * s), int(30 * s)]):
        draw.rectangle(
            [cx + shaft_w // 2, shaft_bottom - offset - tooth_h,
             cx + shaft_w // 2 + tooth_w, shaft_bottom - offset],
            fill=color,
        )


def draw_handshake(draw, cx, cy, scale=1.0, color=(255, 255, 255, 230)):
    """Draw a simplified handshake symbol."""
    s = scale
    # Left hand (coming from left)
    # Simplified: two angled shapes meeting in the middle
    lw = int(80 * s)
    lh = int(30 * s)

    # Left arm
    draw.rounded_rectangle(
        [cx - lw, cy - lh // 2, cx + int(10 * s), cy + lh // 2],
        radius=int(12 * s),
        fill=color,
    )

    # Right arm (overlapping, slightly offset)
    color2 = tuple(max(0, c - 30) for c in color[:3]) + (color[3] if len(color) > 3 else 255,)
    draw.rounded_rectangle(
        [cx - int(10 * s), cy - lh // 2 - int(5 * s), cx + lw, cy + lh // 2 - int(5 * s)],
        radius=int(12 * s),
        fill=color2,
    )

    # Grip indicator (small circle in center)
    draw.ellipse(
        [cx - int(8 * s), cy - int(8 * s), cx + int(8 * s), cy + int(8 * s)],
        fill=(0, 0, 0, 50),
    )


def draw_robot_buddy(draw, cx, cy, scale=1.0, color=(255, 255, 255)):
    """Draw a friendly robot/mascot head."""
    s = scale

    # Head (rounded square)
    head_size = int(55 * s)
    draw.rounded_rectangle(
        [cx - head_size, cy - head_size - int(20 * s),
         cx + head_size, cy + head_size - int(20 * s)],
        radius=int(20 * s),
        fill=color,
    )

    # Eyes
    eye_r = int(12 * s)
    eye_y = cy - int(25 * s)
    draw.ellipse(
        [cx - int(25 * s) - eye_r, eye_y - eye_r,
         cx - int(25 * s) + eye_r, eye_y + eye_r],
        fill=(50, 50, 50),
    )
    draw.ellipse(
        [cx + int(25 * s) - eye_r, eye_y - eye_r,
         cx + int(25 * s) + eye_r, eye_y + eye_r],
        fill=(50, 50, 50),
    )

    # Eye highlights
    hl_r = int(5 * s)
    draw.ellipse(
        [cx - int(25 * s) - int(3 * s) - hl_r, eye_y - int(3 * s) - hl_r,
         cx - int(25 * s) - int(3 * s) + hl_r, eye_y - int(3 * s) + hl_r],
        fill=(255, 255, 255),
    )
    draw.ellipse(
        [cx + int(25 * s) - int(3 * s) - hl_r, eye_y - int(3 * s) - hl_r,
         cx + int(25 * s) - int(3 * s) + hl_r, eye_y - int(3 * s) + hl_r],
        fill=(255, 255, 255),
    )

    # Smile
    smile_y = cy - int(5 * s)
    draw.arc(
        [cx - int(20 * s), smile_y - int(5 * s),
         cx + int(20 * s), smile_y + int(20 * s)],
        start=10, end=170,
        fill=(50, 50, 50), width=int(4 * s),
    )

    # Antenna
    draw.line(
        [cx, cy - head_size - int(20 * s), cx, cy - head_size - int(45 * s)],
        fill=color, width=int(5 * s),
    )
    draw.ellipse(
        [cx - int(8 * s), cy - head_size - int(53 * s),
         cx + int(8 * s), cy - head_size - int(37 * s)],
        fill=(255, 200, 50),
    )

    # Clipboard in front
    clip_w = int(35 * s)
    clip_h = int(45 * s)
    clip_y = cy + int(5 * s)
    draw.rounded_rectangle(
        [cx - clip_w, clip_y, cx + clip_w, clip_y + clip_h],
        radius=int(6 * s),
        fill=(240, 240, 240, 220),
    )
    # Clip at top
    draw.rounded_rectangle(
        [cx - int(12 * s), clip_y - int(8 * s),
         cx + int(12 * s), clip_y + int(5 * s)],
        radius=int(3 * s),
        fill=(200, 200, 200, 220),
    )
    # Lines on clipboard
    for i in range(3):
        ly = clip_y + int(15 * s) + i * int(10 * s)
        draw.rounded_rectangle(
            [cx - clip_w + int(10 * s), ly,
             cx + clip_w - int(10 * s), ly + int(4 * s)],
            radius=2,
            fill=(180, 180, 180, 180),
        )


def draw_price_tag(draw, cx, cy, scale=1.0, color=(255, 255, 255)):
    """Draw a price tag / rental label."""
    s = scale

    # Tag body (rotated rectangle approximated with polygon)
    tw = int(65 * s)
    th = int(45 * s)
    # Angled tag shape
    points = [
        (cx - tw, cy - int(10 * s)),
        (cx - int(15 * s), cy - th),
        (cx + tw, cy - int(10 * s)),
        (cx + tw, cy + int(25 * s)),
        (cx - int(15 * s), cy + int(25 * s)),
    ]
    draw.polygon(points, fill=color)

    # Tag hole
    draw.ellipse(
        [cx - int(35 * s) - int(6 * s), cy + int(2 * s) - int(6 * s),
         cx - int(35 * s) + int(6 * s), cy + int(2 * s) + int(6 * s)],
        fill=(0, 0, 0, 60),
    )

    # Small car symbol on tag
    draw_car_silhouette(draw, cx + int(10 * s), cy + int(5 * s), scale=s * 0.35,
                        color=(0, 0, 0, 100))


def draw_checkmark(draw, cx, cy, scale=1.0, color=(255, 255, 255)):
    """Draw a bold checkmark."""
    s = scale
    # Thick checkmark using polygon
    points = [
        (cx - int(35 * s), cy),
        (cx - int(10 * s), cy + int(30 * s)),
        (cx + int(40 * s), cy - int(30 * s)),
        (cx + int(30 * s), cy - int(40 * s)),
        (cx - int(10 * s), cy + int(15 * s)),
        (cx - int(28 * s), cy - int(10 * s)),
    ]
    draw.polygon(points, fill=color)


def draw_multiple_cars(draw, cx, cy, scale=1.0, color=(255, 255, 255, 200)):
    """Draw a group/fleet of cars."""
    s = scale
    # Three cars in a row, slightly overlapping
    offsets = [(-60, 0), (0, -5), (60, 0)]
    scales = [0.5, 0.6, 0.5]
    alphas = [180, 230, 180]

    for (ox, oy), cs, alpha in zip(offsets, scales, alphas):
        c = color[:3] + (alpha,) if len(color) == 4 else color
        draw_car_silhouette(draw, cx + int(ox * s), cy + int(oy * s), scale=s * cs, color=c)


def add_subtle_shadow(img):
    """Add a subtle drop shadow effect."""
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # Create a slightly offset, blurred version of the icon content
    content = img.copy()
    # Extract just the alpha channel as shadow
    r, g, b, a = content.split()
    shadow_alpha = a.filter(ImageFilter.GaussianBlur(radius=12))
    # Darken
    shadow_img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    shadow_data = []
    for pixel in shadow_alpha.getdata():
        shadow_data.append((0, 0, 0, min(60, pixel)))
    shadow_alpha_put = Image.new("L", (SIZE, SIZE))
    shadow_alpha_put.putdata([d[3] for d in shadow_data])
    shadow_img.paste((0, 0, 0, 60), mask=shadow_alpha_put)

    # Offset shadow slightly
    result = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    result.paste(shadow_img, (4, 6), shadow_img)
    result = Image.alpha_composite(result, img)
    return result


def add_highlight(draw, size):
    """Add a subtle top highlight for the macOS glass effect."""
    # Semi-transparent white gradient at top
    for y in range(size // 3):
        alpha = int(40 * (1 - y / (size / 3)))
        draw.line([(size * 0.15, y), (size * 0.85, y)],
                  fill=(255, 255, 255, alpha))


# ============================================================
# ICON 1: Key + Car (Blue)
# ============================================================
def create_icon_key_car():
    img = create_icon_base((30, 100, 200), (15, 60, 150))
    draw = ImageDraw.Draw(img)

    # Subtle highlight
    add_highlight(draw, SIZE)

    # Car at bottom center
    draw_car_silhouette(draw, SIZE // 2, SIZE // 2 + 120, scale=2.8,
                        color=(255, 255, 255, 220))

    # Key above car
    draw_key(draw, SIZE // 2, SIZE // 2 - 100, scale=2.5,
             color=(255, 230, 100, 240))

    return img


# ============================================================
# ICON 2: CB Monogram (Dark blue / Turquoise)
# ============================================================
def create_icon_cb_mono():
    img = create_icon_base((10, 30, 60), (0, 140, 160), gradient_dir="vertical")
    draw = ImageDraw.Draw(img)

    add_highlight(draw, SIZE)

    # Try to find a good font
    font = None
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSDisplay.ttf",
        "/System/Library/Fonts/SFNSText.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 360)
                break
            except Exception:
                continue

    if font is None:
        font = ImageFont.load_default()

    # Draw "CB" text
    text = "CB"
    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (SIZE - tw) // 2
    ty = (SIZE - th) // 2 - 20

    # Shadow
    draw.text((tx + 4, ty + 4), text, font=font, fill=(0, 0, 0, 60))
    # Main text
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 240))

    # Subtle underline accent
    accent_y = ty + th + 30
    draw.rounded_rectangle(
        [SIZE // 2 - 80, accent_y, SIZE // 2 + 80, accent_y + 8],
        radius=4, fill=(0, 220, 200, 150),
    )

    return img


# ============================================================
# ICON 3: Handshake + Car (Green/Teal)
# ============================================================
def create_icon_handshake():
    img = create_icon_base((20, 150, 120), (0, 100, 80))
    draw = ImageDraw.Draw(img)

    add_highlight(draw, SIZE)

    # Handshake in center-upper area
    draw_handshake(draw, SIZE // 2, SIZE // 2 - 60, scale=2.8,
                   color=(255, 255, 255, 230))

    # Small car below
    draw_car_silhouette(draw, SIZE // 2, SIZE // 2 + 160, scale=2.0,
                        color=(255, 255, 255, 200))

    return img


# ============================================================
# ICON 4: Dashboard Buddy (Orange)
# ============================================================
def create_icon_buddy():
    img = create_icon_base((240, 130, 20), (200, 80, 10))
    draw = ImageDraw.Draw(img)

    add_highlight(draw, SIZE)

    # Robot buddy
    draw_robot_buddy(draw, SIZE // 2, SIZE // 2 - 20, scale=2.8,
                     color=(255, 255, 255))

    return img


# ============================================================
# ICON 5: Rental Tag (Purple)
# ============================================================
def create_icon_tag():
    img = create_icon_base((120, 40, 180), (80, 20, 140))
    draw = ImageDraw.Draw(img)

    add_highlight(draw, SIZE)

    # Price tag
    draw_price_tag(draw, SIZE // 2, SIZE // 2, scale=2.8,
                   color=(255, 255, 255))

    return img


# ============================================================
# ICON 6: Checkmark Fleet (Emerald green)
# ============================================================
def create_icon_fleet():
    img = create_icon_base((0, 160, 100), (0, 120, 70))
    draw = ImageDraw.Draw(img)

    add_highlight(draw, SIZE)

    # Fleet of cars at bottom
    draw_multiple_cars(draw, SIZE // 2, SIZE // 2 + 120, scale=2.8,
                       color=(255, 255, 255, 200))

    # Checkmark above
    draw_checkmark(draw, SIZE // 2 - 10, SIZE // 2 - 80, scale=2.8,
                   color=(255, 255, 255, 240))

    return img


# ============================================================
# MAIN: Generate all icons and thumbnails
# ============================================================
def main():
    icons = [
        ("icon-key-car", create_icon_key_car),
        ("icon-cb-mono", create_icon_cb_mono),
        ("icon-handshake", create_icon_handshake),
        ("icon-buddy", create_icon_buddy),
        ("icon-tag", create_icon_tag),
        ("icon-fleet", create_icon_fleet),
    ]

    os.makedirs(VARIANTS_DIR, exist_ok=True)
    os.makedirs(THUMBS_DIR, exist_ok=True)

    for name, creator in icons:
        print(f"Generating {name}...")
        img = creator()

        # Save full-size
        path_full = os.path.join(VARIANTS_DIR, f"{name}.png")
        img.save(path_full, "PNG")
        print(f"  Saved: {path_full} ({img.size[0]}x{img.size[1]})")

        # Create and save thumbnail
        thumb = img.resize((256, 256), Image.LANCZOS)
        path_thumb = os.path.join(THUMBS_DIR, f"{name}-thumb.png")
        thumb.save(path_thumb, "PNG")
        print(f"  Saved: {path_thumb} (256x256)")

    print("\nAll icons generated successfully!")


if __name__ == "__main__":
    main()
