# Hari's Journal Portfolio

A handcrafted, journal-style personal portfolio website featuring project work and mountain adventures.

## Design Philosophy

This portfolio embraces a physical journal aesthetic - think pages carried on hikes, filled with project notes and trail memories. Every element feels handmade, not templated.

## Features

- Handwritten typography throughout (Caveat, Indie Flower, Shadows Into Light)
- Hand-drawn SVG elements and decorative doodles
- Split journal page layout on desktop (Projects left, What I'm Doing right)
- Dedicated page for mountain hiking adventures
- Taped-in polaroid-style photos with washi tape accents
- Organic animations using Framer Motion
- Fully responsive design
- Accessibility-friendly with reduced motion support

## Tech Stack

- React 18
- Vite
- Tailwind CSS (custom theme)
- Framer Motion (animations)
- Lucide React (icon base for hand-drawn variants)

## Getting Started

Install dependencies:
```bash
npm install
```

Run development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

## Customization

### Replace Placeholder Content

1. **Personal Info** - Update in `src/components/Hero.jsx`
2. **Projects** - Edit `projectsData` array in `src/components/Projects.jsx`
3. **What I'm Doing** - Edit `activitiesData` in `src/components/WhatImDoing.jsx`
4. **Hikes** - Edit `hikesData` array in `src/pages/ClimbingPage.jsx`
5. **Photos** - Add your photos to `/public` folder and update paths
6. **Social Links** - Update LinkedIn/GitHub URLs in Hero and Footer

### Add Your Photo

- Hero photo: 800x800px WebP (or 400x400 @2x)
- Hike photos: 1200x900px WebP (or 600x450 @2x)
- Place in `/public` folder and update component imports

### Colors

Customize the journal color palette in `tailwind.config.js`:
- `paper` - Background cream color
- `ink` - Primary text color
- `ink-accent` - Secondary color (green sketches)
- `highlight` - Accent color (terracotta)
- `fade` - Lighter text
- `line` - Borders and dividers

## Performance

- All animations respect `prefers-reduced-motion`
- Images should be optimized WebP format
- Lazy loading below the fold
- Target Lighthouse score >85

## License

Personal portfolio - feel free to use as inspiration but please don't copy wholesale. Make it your own!
