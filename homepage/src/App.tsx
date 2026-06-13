import { useState, useEffect } from 'react';

const APP_URL = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173';

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG icons — no external dependency
// ─────────────────────────────────────────────────────────────────────────────
function IconChat() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function IconShield() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function IconClipboard() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>;
}
function IconUsers() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IconSearch() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IconLock() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function IconCheck() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IconArrow() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
}
function IconMenu() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function IconClose() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wordmark
// ─────────────────────────────────────────────────────────────────────────────
function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
      <span style={{ color: '#1E3347' }}>my</span>
      <span style={{ color: '#1E88FF' }}>ABA</span>
      <span style={{ color: '#3F9B2F' }}>.ai</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────
function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLink = (href: string, label: string) => (
    <a
      key={label}
      href={href}
      style={{ fontSize: 14, fontWeight: 500, color: '#5A7184', transition: 'color 0.15s' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#1E3347')}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#5A7184')}
    >
      {label}
    </a>
  );

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'white',
      borderBottom: scrolled ? '1px solid #E4EEF3' : '1px solid transparent',
      boxShadow: scrolled ? '0 2px 16px rgba(0,0,0,0.06)' : 'none',
      transition: 'box-shadow 0.2s, border-color 0.2s',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="/app-icon.png"
            alt="myABA.ai"
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Wordmark size={20} />
        </a>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="desktop-nav">
          {navLink('#features', 'Features')}
          {navLink('#how-it-works', 'How It Works')}
          {navLink('#security', 'Security')}
        </div>

        {/* Desktop CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="desktop-nav">
          <a
            href={APP_URL}
            style={{
              padding: '8px 18px', fontSize: 14, fontWeight: 600,
              color: '#1E88FF', border: '1.5px solid #1E88FF',
              borderRadius: 8, transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#EFF6FF')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Sign In
          </a>
          <a
            href={`${APP_URL}/onboard`}
            style={{
              padding: '8px 18px', fontSize: 14, fontWeight: 600,
              color: 'white',
              background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(30,136,255,0.28)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Get Started
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          style={{ display: 'none', background: 'none', border: 'none', color: '#1E3347', padding: 4 }}
          className="mobile-menu-btn"
        >
          {menuOpen ? <IconClose /> : <IconMenu />}
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div style={{
          background: 'white', borderTop: '1px solid #E4EEF3',
          padding: '16px 24px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {[['#features', 'Features'], ['#how-it-works', 'How It Works'], ['#security', 'Security']].map(([href, label]) => (
            <a key={label} href={href} onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, fontWeight: 500, color: '#1E3347', padding: '6px 0' }}>
              {label}
            </a>
          ))}
          <div style={{ height: 1, background: '#E4EEF3' }} />
          <a href={APP_URL} style={{ fontSize: 15, fontWeight: 600, color: '#1E88FF' }}>Sign In</a>
          <a
            href={`${APP_URL}/onboard`}
            style={{
              textAlign: 'center', padding: '11px 0', fontSize: 15, fontWeight: 700,
              color: 'white', background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
              borderRadius: 8, boxShadow: '0 2px 8px rgba(30,136,255,0.28)',
            }}
          >
            Get Started Free
          </a>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: block !important; }
        }
      `}</style>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{
      background: 'linear-gradient(160deg, #0C1E2E 0%, #0F2A3D 55%, #0C2318 100%)',
      paddingTop: 128,
      paddingBottom: 96,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle grid texture */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* Blue glow */}
      <div style={{
        position: 'absolute', top: -120, right: -80, width: 480, height: 480,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(30,136,255,0.18) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* Green glow */}
      <div style={{
        position: 'absolute', bottom: -60, left: -60, width: 320, height: 320,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(63,155,47,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', textAlign: 'center', position: 'relative', zIndex: 1 }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'rgba(30,136,255,0.15)',
          border: '1px solid rgba(30,136,255,0.3)',
          borderRadius: 20, padding: '6px 14px', marginBottom: 28,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E88FF', boxShadow: '0 0 6px #1E88FF' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#60A5FA', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            HIPAA-Compliant Clinical AI
          </span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 62px)',
          fontWeight: 900,
          color: 'white',
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          marginBottom: 22,
        }}>
          Documentation that{' '}
          <span style={{
            background: 'linear-gradient(90deg, #1E88FF, #3F9B2F)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            writes itself
          </span>
        </h1>

        {/* Sub */}
        <p style={{
          fontSize: 'clamp(16px, 2.2vw, 19px)',
          color: '#94A8B8',
          lineHeight: 1.65,
          maxWidth: 620,
          margin: '0 auto 38px',
        }}>
          AI-powered note-writing, clinical documentation, and progress tracking for ABA clinical teams — with built-in content governance on every output.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 56 }}>
          <a
            href={`${APP_URL}/onboard`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px', fontSize: 15, fontWeight: 700,
              color: 'white',
              background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(30,136,255,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(30,136,255,0.55)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(30,136,255,0.45)'; }}
          >
            Get Started Free <IconArrow />
          </a>
          <a
            href={APP_URL}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px', fontSize: 15, fontWeight: 600,
              color: 'rgba(255,255,255,0.85)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              borderRadius: 10,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}
          >
            Sign In
          </a>
        </div>

        {/* Trust bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          {[
            'HIPAA Compliant',
            'AI Content Governance',
            'SOC 2 Ready',
          ].map((label, i) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginRight: 2 }}>·</span>}
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 500 }}>
                <span style={{ color: '#4ADE80', marginRight: 4 }}>✓</span>
                {label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────────────────────────────────────
interface Feature {
  icon: React.ReactNode;
  color: string;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: <IconChat />, color: '#1E88FF',
    title: 'AI Clinical Chat',
    desc: 'Generate clinical documentation and session summaries in seconds. Context-aware AI understands ABA terminology and formats output for clinical use.',
  },
  {
    icon: <IconShield />, color: '#3F9B2F',
    title: 'ACLX Content Governance',
    desc: 'Every AI output runs through our policy engine before it reaches your team. PHI detection, clinical sensitivity scoring, and human review workflows built in.',
  },
  {
    icon: <IconClipboard />, color: '#F5A623',
    title: 'Audit Trails',
    desc: 'Full audit logging on every document generated, reviewed, and approved. Exportable records for compliance reviews and billing audits.',
  },
  {
    icon: <IconUsers />, color: '#7C3AED',
    title: 'Team Collaboration',
    desc: 'Assign supervisors to direct staff, share caseloads across supervisors, and manage organization-wide templates and insurance settings from one place.',
  },
  {
    icon: <IconSearch />, color: '#0891B2',
    title: 'Smart Search',
    desc: 'Find any client record, session note, or document in milliseconds. Full-text search across your entire organization\'s clinical history.',
  },
  {
    icon: <IconLock />, color: '#DC2626',
    title: 'Secure by Design',
    desc: 'Firebase-backed authentication, data isolated per organization, all documents encrypted at rest and in transit. HIPAA BAA available.',
  },
];

function Features() {
  return (
    <section id="features" style={{ background: 'white', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E88FF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Platform Features
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#1E3347', letterSpacing: '-0.02em', marginBottom: 14 }}>
            Everything your clinical team needs
          </h2>
          <p style={{ fontSize: 16, color: '#5A7184', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            Built specifically for ABA therapy providers — not a generic AI tool bolted onto a template library.
          </p>
        </div>

        {/* Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 20,
        }}>
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: '#FAFCFF',
                border: '1.5px solid #E4EEF3',
                borderRadius: 16,
                padding: '28px 26px',
                transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = f.color + '44';
                el.style.boxShadow = `0 4px 20px ${f.color}14`;
                el.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.borderColor = '#E4EEF3';
                el.style.boxShadow = 'none';
                el.style.transform = 'none';
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: f.color + '14',
                color: f.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E3347', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// How It Works
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    num: '01',
    color: '#1E88FF',
    title: 'Set up your organization',
    desc: 'Create your account, configure your organization settings, invite your clinical team, and upload your standard templates and policy library. Takes under 15 minutes.',
    bullets: ['Role-based access for supervisors, direct staff, and admins', 'Invite your team and configure organization settings in minutes'],
  },
  {
    num: '02',
    color: '#3F9B2F',
    title: 'Add your clients',
    desc: 'Import or create structured client profiles with treatment goals, authorization details, diagnosis codes, and assigned clinicians.',
    bullets: ['Client profiles with diagnosis and treatment history', 'Assign clinicians and supervisors to each client', 'Client information is used to ground and personalize AI chat responses'],
  },
  {
    num: '03',
    color: '#F5A623',
    title: 'Generate & govern documentation',
    desc: 'Chat with the AI to draft clinical documentation and session summaries. Every output can be reviewed and is always labeled.',
    bullets: ['Natural language clinical chat', 'Automatic PHI governance', 'Human review queue for escalations'],
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ background: '#F0F7FA', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3F9B2F', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Getting Started
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#1E3347', letterSpacing: '-0.02em', marginBottom: 14 }}>
            Up and running in minutes
          </h2>
          <p style={{ fontSize: 16, color: '#5A7184', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            No lengthy onboarding. No IT department required. Your team starts generating documentation on day one.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              style={{
                background: 'white',
                borderRadius: 20,
                border: '1.5px solid #E4EEF3',
                padding: '36px 40px',
                display: 'grid',
                gridTemplateColumns: i % 2 === 0 ? '1fr auto' : 'auto 1fr',
                gap: 40,
                alignItems: 'center',
              }}
            >
              {/* Content */}
              <div style={{ order: i % 2 === 0 ? 1 : 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: step.color,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    STEP {step.num}
                  </span>
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: '#1E3347', letterSpacing: '-0.01em', marginBottom: 10 }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 15, color: '#5A7184', lineHeight: 1.65, marginBottom: 18 }}>
                  {step.desc}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {step.bullets.map((b) => (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ color: step.color, flexShrink: 0 }}><IconCheck /></div>
                      <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Step number visual */}
              <div
                style={{
                  order: i % 2 === 0 ? 2 : 1,
                  width: 100, height: 100,
                  borderRadius: 24,
                  background: step.color + '12',
                  border: `2px solid ${step.color}28`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  fontSize: 42, fontWeight: 900, color: step.color,
                  letterSpacing: '-0.04em', opacity: 0.7,
                }}>
                  {step.num}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Section
// ─────────────────────────────────────────────────────────────────────────────
function Security() {
  const pillars = [
    {
      icon: <IconShield />,
      color: '#1E88FF',
      title: 'HIPAA-Compliant Infrastructure',
      items: [
        'Firebase-backed authentication with MFA support',
        'Data isolated per organization — no cross-tenant access',
        'All documents encrypted at rest (AES-256) and in transit (TLS 1.3)',
        'HIPAA Business Associate Agreement (BAA) available',
      ],
    },
    {
      icon: <IconShield />,
      color: '#3F9B2F',
      title: 'ACLX Content Governance Engine',
      items: [
        'Every AI output is scored before delivery to end users',
        'PHI detection and clinical sensitivity classification',
        'Configurable hard-block rules for SUD, psychotherapy, HIV, genetic data',
        'Human review queue for escalated content — nothing auto-releases',
      ],
    },
    {
      icon: <IconLock />,
      color: '#F5A623',
      title: 'Access Control & Audit',
      items: [
        'Role-based access for supervisors, direct staff, billing, and scheduling',
        'Full audit trail for every AI call, document generated, and review decision',
        'Supervisor delegation with traceable approval chains',
        'Session timeout and MFA configurable per organization',
      ],
    },
  ];

  return (
    <section id="security" style={{
      background: 'linear-gradient(160deg, #0C1E2E 0%, #0F2A3D 100%)',
      padding: '96px 24px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Security & Compliance
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: 'white', letterSpacing: '-0.02em', marginBottom: 14 }}>
            Built for protected health information
          </h2>
          <p style={{ fontSize: 16, color: '#94A8B8', maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            Clinical documentation contains the most sensitive data in healthcare. We engineered myABA.ai from the ground up to protect it.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {pillars.map((p) => (
            <div
              key={p.title}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1.5px solid ${p.color}30`,
                borderRadius: 18,
                padding: '30px 28px',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: p.color + '20',
                color: p.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18,
              }}>
                {p.icon}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'white', marginBottom: 16 }}>{p.title}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.items.map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ color: p.color, flexShrink: 0, marginTop: 1 }}><IconCheck /></div>
                    <span style={{ fontSize: 13, color: '#94A8B8', lineHeight: 1.55 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Solo',
    price: 'Contact us',
    desc: 'For independent clinicians and solo practitioners.',
    highlight: false,
    features: ['1 clinician', 'Up to 25 active clients', 'AI clinical chat', 'HIPAA-compliant storage', 'Email support'],
  },
  {
    name: 'Team',
    price: 'Contact us',
    desc: 'For small-to-mid-sized ABA clinics and group practices.',
    highlight: true,
    features: ['Up to 15 clinicians', 'Unlimited clients', 'Full team collaboration', 'Review queue & governance', 'Custom templates', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: 'Contact us',
    desc: 'For large organizations and multi-site providers.',
    highlight: false,
    features: ['Unlimited clinicians', 'Multi-location support', 'Custom policy rules (ACLX)', 'HIPAA BAA included', 'SSO / SAML', 'Dedicated support'],
  },
];

function Pricing() {
  return (
    <section id="pricing" style={{ background: 'white', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E88FF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Pricing
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 800, color: '#1E3347', letterSpacing: '-0.02em', marginBottom: 14 }}>
            Simple, transparent plans
          </h2>
          <p style={{ fontSize: 16, color: '#5A7184', maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            Start with a 14-day free trial. No credit card required.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'start' }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                borderRadius: 18,
                border: plan.highlight ? '2px solid #1E88FF' : '1.5px solid #E4EEF3',
                background: plan.highlight ? 'linear-gradient(160deg, #EFF6FF, #F8FBFF)' : '#FAFCFF',
                padding: '32px 28px',
                position: 'relative',
              }}
            >
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
                  color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '4px 14px', borderRadius: 20,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  boxShadow: '0 2px 8px rgba(30,136,255,0.4)',
                }}>
                  Most Popular
                </div>
              )}

              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E3347', marginBottom: 6 }}>{plan.name}</div>
              <div style={{ fontSize: 13, color: '#5A7184', marginBottom: 20, lineHeight: 1.4 }}>{plan.desc}</div>

              <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #E4EEF3' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1E88FF' }}>{plan.price}</span>
                <div style={{ fontSize: 12, color: '#A0ADB8', marginTop: 2 }}>reach out to discuss your needs</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ color: plan.highlight ? '#1E88FF' : '#3F9B2F', flexShrink: 0 }}><IconCheck /></div>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{f}</span>
                  </div>
                ))}
              </div>

              <a
                href={plan.highlight ? `${APP_URL}/onboard` : 'mailto:hello@myaba.ai'}
                style={{
                  display: 'block', textAlign: 'center',
                  padding: '11px 0', fontSize: 14, fontWeight: 700,
                  color: plan.highlight ? 'white' : '#1E88FF',
                  background: plan.highlight ? 'linear-gradient(135deg, #1E88FF, #1565C0)' : 'transparent',
                  border: plan.highlight ? 'none' : '1.5px solid #1E88FF',
                  borderRadius: 10,
                  boxShadow: plan.highlight ? '0 2px 10px rgba(30,136,255,0.3)' : 'none',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {plan.highlight ? 'Start Free Trial' : 'Contact Sales'}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CTA Banner
// ─────────────────────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section style={{
      background: 'linear-gradient(135deg, #1E88FF 0%, #1565C0 100%)',
      padding: '72px 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', marginBottom: 14 }}>
          Ready to reclaim your clinical time?
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 36, lineHeight: 1.6 }}>
          Join ABA clinics saving hours per clinician per week on documentation.
          Start your free 14-day trial today.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a
            href={`${APP_URL}/onboard`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', fontSize: 15, fontWeight: 700,
              color: '#1565C0', background: 'white',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'; }}
          >
            Get Started Free <IconArrow />
          </a>
          <a
            href="mailto:hello@myaba.ai"
            style={{
              padding: '14px 28px', fontSize: 15, fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              border: '1.5px solid rgba(255,255,255,0.4)',
              borderRadius: 10,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)')}
          >
            Talk to Sales
          </a>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────
function Footer() {
  const col = (title: string, links: { label: string; href: string }[]) => (
    <div key={title}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3347', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            style={{ fontSize: 13, color: '#5A7184', transition: 'color 0.15s' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#1E3347')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#5A7184')}
          >
            {label}
          </a>
        ))}
      </div>
    </div>
  );

  return (
    <footer style={{ background: '#F8FBFF', borderTop: '1px solid #E4EEF3', padding: '56px 24px 32px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Top row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 60, marginBottom: 48, flexWrap: 'wrap' }}>

          {/* Brand */}
          <div style={{ maxWidth: 260 }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src="/app-icon.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <Wordmark size={18} />
            </a>
            <p style={{ fontSize: 13, color: '#5A7184', lineHeight: 1.65 }}>
              AI-powered clinical documentation for ABA therapy providers. Built with HIPAA compliance and content governance at the core.
            </p>
          </div>

          {/* Link columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 32 }}>
            {col('Product', [
              { label: 'Features', href: '#features' },
              { label: 'How It Works', href: '#how-it-works' },
              { label: 'Security', href: '#security' },
              { label: 'Pricing', href: '#pricing' },
            ])}
            {col('Platform', [
              { label: 'Sign In', href: APP_URL },
              { label: 'Get Started', href: `${APP_URL}/onboard` },
              { label: 'Status', href: '#' },
            ])}
            {col('Company', [
              { label: 'About', href: '#' },
              { label: 'Contact', href: 'mailto:hello@myaba.ai' },
              { label: 'Privacy Policy', href: '#' },
              { label: 'Terms of Service', href: '#' },
            ])}
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ borderTop: '1px solid #E4EEF3', paddingTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <p style={{ fontSize: 12, color: '#A0ADB8' }}>
            © 2026 myABA.ai. All rights reserved.
          </p>
          <p style={{ fontSize: 12, color: '#A0ADB8' }}>
            HIPAA-compliant platform · All data encrypted in transit
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Security />
        <Pricing />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}
