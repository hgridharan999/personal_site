import SiteShell from '../site/SiteShell';

const INTRO = 'This notice is intended to be clear, practical, and aligned with common privacy expectations for a personal website.';

const sections = [
  {
    id: 'privacy',
    title: 'Privacy policy',
    body: [
      'This website is operated by Hari Gridharan. We collect only the information needed to operate the site and respond to direct contact. We do not sell or rent your personal data.',
      'We may store limited operational data such as request logs, error information, and basic usage metadata to maintain security and reliability. This information is kept only as long as necessary for those purposes.',
      'If you contact us through the site, the information you provide may be used to respond to your message. You may request that we delete your correspondence at any time.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies and tracking',
    body: [
      'This site sets no cookies and uses no advertising, behavioral tracking, or third-party analytics.',
      'The climate startup search keeps a random id for the current tab in your browser’s session storage, so it can count which results get clicked. It is not linked to you and is gone when you close the tab.',
    ],
  },
  {
    id: 'terms',
    title: 'Terms of use',
    body: [
      'By using this website, you agree to use it lawfully and respectfully. You may not attempt to interfere with the site or scrape it in a harmful way.',
      'All content on this website is provided for informational and personal portfolio purposes. If you reuse any content, please attribute it appropriately.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [
      'For privacy questions, deletion requests, or other legal inquiries, please contact Hari directly through the site contact channels or by reaching out through the public profiles linked on the site.',
    ],
  },
];

/**
 * /privacy, /terms and /legal all show this one notice, in the shared shell. Each section's h2
 * carries the id (privacy, cookies, terms, contact) so a link can land on its heading.
 */
export default function LegalPage() {
  return (
    <SiteShell title="Legal & privacy" intro={INTRO}>
      {sections.map(({ id, title, body }) => (
        <section key={id} aria-labelledby={id}>
          <h2 className="head" id={id}>{title}</h2>
          <div className="sp-text">
            {body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}
    </SiteShell>
  );
}
