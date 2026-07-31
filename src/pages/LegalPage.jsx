import { Link } from 'react-router-dom';

const sections = [
  {
    title: 'Privacy policy',
    body: [
      'This website is operated by Hari Gridharan. We collect only the information needed to operate the site and respond to direct contact or chat submissions.',
      'When you use the chat feature, your message text is sent to a server-side endpoint so it can be processed and returned to you. We do not sell or rent your personal data.',
      'We may store limited operational data such as request logs, error information, and basic usage metadata to maintain security and reliability. This information is kept only as long as necessary for those purposes.',
      'If you contact us through the site, the information you provide may be used to respond to your message. You may request that we delete your correspondence at any time.',
    ],
  },
  {
    title: 'Cookies and tracking',
    body: [
      'This site uses a minimal consent preference cookie in your browser so it can remember whether you accepted the notice. No advertising, behavioral tracking, or third-party analytics are currently used.',
      'If you decline the notice, the site will continue to function without storing this preference beyond the current browser session.',
    ],
  },
  {
    title: 'Terms of use',
    body: [
      'By using this website, you agree to use it lawfully and respectfully. You may not attempt to interfere with the site, scrape it in a harmful way, or use the chat feature to transmit illegal or abusive content.',
      'All content on this website is provided for informational and personal portfolio purposes. If you reuse any content, please attribute it appropriately.',
    ],
  },
  {
    title: 'Contact',
    body: [
      'For privacy questions, deletion requests, or other legal inquiries, please contact Hari directly through the site contact channels or by reaching out through the public profiles linked on the site.',
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="space-y-3">
          <Link to="/" className="text-sm underline underline-offset-4 hover:text-highlight">
            ← Back to site
          </Link>
          <h1 className="text-3xl font-semibold">Legal & privacy information</h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-accent">
            This notice is intended to be clear, practical, and aligned with common privacy expectations for a personal website and AI chat feature.
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="rounded-sm border border-line bg-white/70 p-5 shadow-sm">
              <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
              <div className="space-y-3 text-sm leading-7 text-ink-accent">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
