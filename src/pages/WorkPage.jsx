import WhatImDoing from '../components/WhatImDoing';
import PageShell from '../components/PageShell';

export default function WorkPage() {
  return (
    <PageShell title="Work" subtitle="Roles, teams & the things I’ve shipped.">
      <WhatImDoing />
    </PageShell>
  );
}
