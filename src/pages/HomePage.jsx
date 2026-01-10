import Hero from '../components/Hero';
import Projects from '../components/Projects';
import WhatImDoing from '../components/WhatImDoing';
import Footer from '../components/Footer';

function HomePage() {
  return (
    <div className="min-h-screen bg-paper relative">
      {/* Very subtle vignette effect */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-radial from-transparent via-transparent to-ink/5" />

      {/* Hero section */}
      <Hero />

      {/* Main content - split layout on desktop */}
      <div className="relative">
        {/* Desktop: Split journal pages */}
        <div className="hidden lg:block">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="grid grid-cols-[1.2fr,0.8fr] gap-16 relative">
              {/* Journal spine/binding in the middle */}
              <div className="absolute left-[54%] top-0 bottom-0 w-1 -translate-x-1/2">
                <div className="sticky top-24 h-[600px]">
                  <svg
                    width="4"
                    height="100%"
                    viewBox="0 0 4 600"
                    fill="none"
                    className="w-full h-full"
                    preserveAspectRatio="none"
                  >
                    <line
                      x1="2"
                      y1="0"
                      x2="2"
                      y2="600"
                      stroke="#D4CFC4"
                      strokeWidth="2"
                      strokeDasharray="8 12"
                    />
                    {/* Binding rings */}
                    <circle cx="2" cy="80" r="6" fill="none" stroke="#D4CFC4" strokeWidth="1.5" />
                    <circle cx="2" cy="200" r="6" fill="none" stroke="#D4CFC4" strokeWidth="1.5" />
                    <circle cx="2" cy="320" r="6" fill="none" stroke="#D4CFC4" strokeWidth="1.5" />
                    <circle cx="2" cy="440" r="6" fill="none" stroke="#D4CFC4" strokeWidth="1.5" />
                  </svg>
                </div>
              </div>

              {/* Left page - Projects */}
              <div id="projects" className="pr-8">
                <Projects />
              </div>

              {/* Right page - What I'm Doing */}
              <div className="pl-8">
                <WhatImDoing />
              </div>
            </div>
          </div>
        </div>

        {/* Mobile/Tablet: Stacked layout */}
        <div className="lg:hidden">
          <div id="doing">
            <WhatImDoing />
          </div>

          {/* Divider between sections */}
          <div className="max-w-4xl mx-auto px-6 py-12">
            <svg
              width="100%"
              height="12"
              viewBox="0 0 400 12"
              fill="none"
            >
              <path
                d="M4 6Q100 3 200 6T396 7"
                stroke="#D4CFC4"
                strokeWidth="3"
                strokeDasharray="10 8"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div id="projects">
            <Projects />
          </div>
        </div>
      </div>

      {/* Footer */}
      <Footer />

      {/* Small decorative ink splatters scattered around */}
      <div className="ink-splatter top-[20%] right-[5%]" style={{ animationDelay: '3s' }} />
      <div className="ink-splatter top-[50%] left-[3%]" style={{ animationDelay: '4s' }} />
      <div className="ink-splatter bottom-[30%] right-[8%]" style={{ animationDelay: '5s' }} />
    </div>
  );
}

export default HomePage;
