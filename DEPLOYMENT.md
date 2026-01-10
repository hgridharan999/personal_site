# Deployment Guide for Vercel

Your portfolio is ready to deploy! Follow these steps to get it live on Vercel.

## Pre-deployment checklist

- [x] Build tested successfully (`npm run build`)
- [x] No errors or warnings in the codebase
- [x] Unused components removed
- [x] vercel.json configuration created
- [x] Documentation cleaned up

## Quick deploy to Vercel

### Option 1: Deploy via Vercel CLI (recommended)

1. Install Vercel CLI if you haven't:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from your project directory:
   ```bash
   vercel
   ```

4. Follow the prompts:
   - Set up and deploy? **Y**
   - Which scope? Select your account
   - Link to existing project? **N**
   - Project name? (default is fine or customize)
   - Directory? **./** (press enter)
   - Override settings? **N**

5. Your site will be deployed! Vercel will provide a URL.

### Option 2: Deploy via Vercel dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your Git repository (GitHub, GitLab, or Bitbucket)
4. Vercel will auto-detect the settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. Click "Deploy"

## Environment configuration

Vercel will automatically detect your Vite project and configure:
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
- Node Version: 18.x (auto-detected)

## Post-deployment

### Add custom domain (optional)
1. Go to your project settings on Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Update your DNS settings as instructed

### Environment variables
No environment variables are required for this project currently.

### Before you go live

Make sure to update these placeholder items:

1. **Hero Photo**: Replace placeholder in `src/components/Hero.jsx`
2. **Resume PDF**: Add your actual resume to `/public/resume.pdf`
3. **Personal Info**: Verify all links and contact information
4. **Project Details**: Ensure all project data is accurate
5. **Hiking Photos**: Add real photos to `/public` and update paths in `src/pages/ClimbingPage.jsx`

## Troubleshooting

### Build fails
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### Routing issues
The `vercel.json` file is already configured to handle client-side routing.

### Images not loading
- Ensure all image paths start with `/` for absolute paths
- Place images in `/public` folder
- Reference as `/image-name.jpg` in your components

## Performance optimization

After deployment, check your site with:
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [PageSpeed Insights](https://pagespeed.web.dev/)

Target scores:
- Performance: >90
- Accessibility: >95
- Best Practices: >95
- SEO: >90

## Need help?

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

Ready to deploy.
