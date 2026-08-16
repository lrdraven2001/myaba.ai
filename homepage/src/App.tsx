import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import DocumentsPage from './DocumentsPage';
import LegalPage from './LegalPage';

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
function IconDash() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>;
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
export function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  // Section links work as anchors on the homepage; navigate back from other pages
  const sectionHref = (anchor: string) => isHome ? anchor : `/${anchor}`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLink = (href: string, label: string, isRoute = false) => isRoute ? (
    <Link
      key={label}
      to={href}
      style={{ fontSize: 14, fontWeight: 500, color: location.pathname === href ? '#1E3347' : '#5A7184', transition: 'color 0.15s', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#1E3347')}
      onMouseLeave={(e) => (e.currentTarget.style.color = location.pathname === href ? '#1E3347' : '#5A7184')}
    >
      {label}
    </Link>
  ) : (
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
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img
            src="/app-icon.png"
            alt="myABA.ai"
            style={{ width: 36, height: 36, objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <Wordmark size={20} />
        </Link>

        {/* Desktop nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} className="desktop-nav">
          {navLink(sectionHref('#features'), 'Features')}
          {navLink(sectionHref('#how-it-works'), 'How It Works')}
          {navLink(sectionHref('#security'), 'Security')}
          {navLink('/documents', 'Docs', true)}
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
            href="mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest"
            style={{
              padding: '8px 18px', fontSize: 14, fontWeight: 600,
              color: 'white',
              background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(63,155,47,0.28)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Join Waitlist
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
          {[
            [sectionHref('#features'), 'Features', false],
            [sectionHref('#how-it-works'), 'How It Works', false],
            [sectionHref('#security'), 'Security', false],
            ['/documents', 'Documentation', true],
          ].map(([href, label, isRoute]) => isRoute ? (
            <Link key={label as string} to={href as string} onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, fontWeight: 500, color: '#1E3347', padding: '6px 0', textDecoration: 'none' }}>
              {label}
            </Link>
          ) : (
            <a key={label as string} href={href as string} onClick={() => setMenuOpen(false)}
              style={{ fontSize: 15, fontWeight: 500, color: '#1E3347', padding: '6px 0' }}>
              {label}
            </a>
          ))}
          <div style={{ height: 1, background: '#E4EEF3' }} />
          <a href={APP_URL} style={{ fontSize: 15, fontWeight: 600, color: '#1E88FF' }}>Sign In</a>
          <a
            href="mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest"
            style={{
              textAlign: 'center', padding: '11px 0', fontSize: 15, fontWeight: 700,
              color: 'white', background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
              borderRadius: 8, boxShadow: '0 2px 8px rgba(63,155,47,0.28)',
            }}
          >
            Join Waitlist
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
          background: 'rgba(63,155,47,0.15)',
          border: '1px solid rgba(63,155,47,0.35)',
          borderRadius: 20, padding: '6px 14px', marginBottom: 28,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 6px #4ADE80' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ADE80', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Pathfinder Early Access — Now Live
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
            href="mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px', fontSize: 15, fontWeight: 700,
              color: 'white',
              background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(63,155,47,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(63,155,47,0.55)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(63,155,47,0.45)'; }}
          >
            Request Early Access <IconArrow />
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
            Partner Sign In
          </a>
        </div>

        {/* Trust bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          {[
            'HIPAA Compliant',
            'DLP + ACLX Governance',
            'EHR Connected',
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
    desc: 'Generate session notes, treatment summaries, and clinical documentation in seconds. Context-aware AI understands ABA terminology and keeps client details on file so you never re-enter what it already knows.',
  },
  {
    icon: <IconShield />, color: '#3F9B2F',
    title: 'DLP + ACLX Governance',
    desc: 'Two-layer protection on every request. DLP scanning blocks non-clinical identifiers — SSNs, payment card numbers — before they reach the AI. ACLX scores every response and enforces hard-block rules for substance use, psychotherapy, HIV, and genetic data before output is delivered.',
  },
  {
    icon: <IconClipboard />, color: '#F5A623',
    title: 'Audit Trails',
    desc: 'Full audit logging on every AI call, document generated, and review decision. Exportable records for compliance reviews, billing audits, and HIPAA breach investigations.',
  },
  {
    icon: <IconUsers />, color: '#7C3AED',
    title: 'Team Collaboration',
    desc: 'Assign supervisors to direct staff, share caseloads, and manage organization-wide templates and policy libraries. Role-based access ensures every team member sees only what their role permits.',
  },
  {
    icon: <IconSearch />, color: '#0891B2',
    title: 'EHR & Practice Integration',
    desc: 'Connect directly to CentralReach and Rethink to pull client records automatically. Importing from OfficePuzzle? Upload your Excel or CSV export and clients are created in seconds.',
  },
  {
    icon: <IconLock />, color: '#DC2626',
    title: 'Secure by Design',
    desc: 'Firebase-backed authentication with mandatory MFA, data isolated per organization, all documents encrypted at rest (AES-256) and in transit (TLS 1.3). A HIPAA Business Associate Agreement is executed with every customer as a condition of access.',
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
    desc: 'Build structured client profiles with diagnosis codes, treatment goals, authorization details, and assigned clinicians — or import them directly from your existing systems.',
    bullets: ['Connect to CentralReach or Rethink to sync client records automatically', 'Import from OfficePuzzle by uploading your Excel or CSV export', 'Client information grounds AI responses so clinicians never re-enter what the system already knows'],
  },
  {
    num: '03',
    color: '#F5A623',
    title: 'Generate & govern documentation',
    desc: 'Chat with the AI to draft session notes, treatment plans, and progress summaries. Every request passes through DLP input scanning and ACLX output governance before anything reaches your team.',
    bullets: ['DLP blocks non-clinical identifiers before they reach the AI', 'ACLX scores and classifies every response before delivery', 'Human review queue holds escalated content until an admin approves it'],
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
        'Mandatory MFA enforced for every user — cannot be disabled',
        'Data isolated per organization — no cross-tenant access',
        'All data encrypted at rest (AES-256) and in transit (TLS 1.3)',
        'Comprehensive audit trail on every AI call and document event',
        'HIPAA Business Associate Agreement (BAA) required before access',
        'Architecture aligned with the 2025 proposed HIPAA Security Rule updates — no gaps to close when finalized',
      ],
    },
    {
      icon: <IconShield />,
      color: '#3F9B2F',
      title: 'AI Input & Output Governance',
      items: [
        'DLP scanning blocks non-clinical identifiers (SSNs, payment data) before they reach the AI',
        'Clinical context — names, diagnoses, session details — passes through so responses stay coherent',
        'Every AI output scored and classified before delivery to end users',
        'Configurable hard-block rules for SUD, psychotherapy, HIV, and genetic data',
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

        {/* SOC 2 + HIPAA compliance badges */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
          {[
            { label: 'HIPAA Compliant', sub: 'BAA required before access', color: '#1E88FF' },
            { label: 'SOC 2 Type II', sub: 'Audit in progress', color: '#3F9B2F' },
            { label: '2025 HIPAA Rule Ready', sub: 'Controls aligned with proposed updates', color: '#F5A623' },
          ].map(badge => (
            <div key={badge.label} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.06)', border: `1px solid ${badge.color}40`,
              borderRadius: 10, padding: '10px 18px',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: badge.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{badge.label}</div>
                <div style={{ fontSize: 11, color: '#94A8B8', marginTop: 2 }}>{badge.sub}</div>
              </div>
            </div>
          ))}
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
  { name: 'Solo',       planKey: 'solo'       as const, price: 'Contact us', freeTrial: true,  highlight: false, desc: 'For independent clinicians and solo practitioners.'       },
  { name: 'Team',       planKey: 'team'       as const, price: 'Contact us', freeTrial: false, highlight: true,  desc: 'For small-to-mid-sized ABA clinics and group practices.'  },
  { name: 'Enterprise', planKey: 'enterprise' as const, price: 'Contact us', freeTrial: false, highlight: false, desc: 'For large organizations and multi-site providers.'          },
];

/**
 * One row per feature, listed in the same order for every card.
 * A string value = included (shown with that label + checkmark).
 * false = not on this plan (shown dimmed with a dash).
 */
const FEATURE_ROWS: { key: string; solo: string | false; team: string | false; enterprise: string | false }[] = [
  { key: 'users',     solo: '1 user',                  team: 'Up to 15 users',             enterprise: 'Unlimited users'                              },
  { key: 'clients',   solo: 'Up to 25 active clients', team: 'Unlimited clients',           enterprise: 'Unlimited clients'                            },
  { key: 'requests',  solo: '200 AI requests / month', team: '2,000 AI requests / month',  enterprise: 'Unlimited AI requests'                        },
  { key: 'chat',      solo: 'AI clinical chat',        team: 'AI clinical chat',            enterprise: 'AI clinical chat'                             },
  { key: 'storage',   solo: 'HIPAA-compliant storage', team: 'HIPAA-compliant storage',     enterprise: 'HIPAA-compliant storage'                      },
  { key: 'collab',    solo: false,                     team: 'Team collaboration',          enterprise: 'Team collaboration'                           },
  { key: 'review',    solo: false,                     team: 'Review queue & governance',   enterprise: 'Review queue & governance'                    },
  { key: 'templates', solo: false,                     team: 'Custom templates',            enterprise: 'Custom templates'                             },
  { key: 'import',    solo: 'OfficePuzzle import',       team: 'OfficePuzzle import',         enterprise: 'OfficePuzzle import'                          },
  { key: 'ehr',       solo: false,                     team: 'EHR integration (CentralReach, Rethink)', enterprise: 'EHR integration (CentralReach, Rethink)'  },
  { key: 'locations', solo: false,                     team: false,                         enterprise: 'Multi-location support'                       },
  { key: 'aclx',      solo: false,                     team: false,                         enterprise: 'Custom AI content governance rules'            },
  { key: 'sso',       solo: false,                     team: false,                         enterprise: 'Work identity sign-on (SAML 2.0 · OIDC)'      },
  { key: 'support',   solo: 'Email support',           team: 'Priority support',            enterprise: 'Dedicated support'                            },
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
          <p style={{ fontSize: 16, color: '#5A7184', maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
            We're currently onboarding pathfinder agencies at no cost while we measure real-world usage and refine the platform.
            Reach out to discuss access.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'stretch' }}>
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              style={{
                borderRadius: 18,
                border: plan.highlight ? '2px solid #1E88FF' : plan.freeTrial ? '2px solid #3F9B2F' : '1.5px solid #E4EEF3',
                background: plan.highlight ? 'linear-gradient(160deg, #EFF6FF, #F8FBFF)' : '#FAFCFF',
                padding: '32px 28px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Most Popular badge — Team */}
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #1E88FF, #1565C0)',
                  color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '4px 14px', borderRadius: 20,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  boxShadow: '0 2px 8px rgba(30,136,255,0.4)',
                  whiteSpace: 'nowrap',
                }}>
                  Most Popular
                </div>
              )}

              {/* Free Trial badge — Solo */}
              {plan.freeTrial && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
                  color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '4px 14px', borderRadius: 20,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  boxShadow: '0 2px 8px rgba(63,155,47,0.4)',
                  whiteSpace: 'nowrap',
                }}>
                  14-Day Free Trial
                </div>
              )}

              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E3347', marginBottom: 6 }}>{plan.name}</div>
              <div style={{ fontSize: 13, color: '#5A7184', marginBottom: 20, lineHeight: 1.4, minHeight: 38 }}>{plan.desc}</div>

              <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #E4EEF3', minHeight: 52 }}>
                {plan.freeTrial ? (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#3F9B2F' }}>14-day free trial</span>
                    <div style={{ fontSize: 12, color: '#A0ADB8', marginTop: 2 }}>No credit card required</div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1E88FF' }}>{plan.price}</span>
                    <div style={{ fontSize: 12, color: '#A0ADB8', marginTop: 2 }}>reach out to discuss your needs</div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
                {FEATURE_ROWS.map((row) => {
                  const label = row[plan.planKey];
                  const included = label !== false;
                  return (
                    <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ color: included ? (plan.highlight ? '#1E88FF' : '#3F9B2F') : '#D1D5DB', flexShrink: 0 }}>
                        {included ? <IconCheck /> : <IconDash />}
                      </div>
                      <span style={{ fontSize: 13, color: included ? '#374151' : '#C4CDD6', fontWeight: included ? 500 : 400 }}>
                        {included ? label : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {plan.planKey !== 'enterprise' && (
                <a
                  href="mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest"
                  style={{
                    display: 'block', textAlign: 'center',
                    padding: '11px 0', fontSize: 14, fontWeight: 700,
                    color: 'white',
                    background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
                    border: 'none',
                    borderRadius: 10,
                    boxShadow: '0 2px 10px rgba(63,155,47,0.3)',
                    transition: 'opacity 0.15s',
                  } as React.CSSProperties}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Join Waitlist
                </a>
              )}
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#A0ADB8', marginTop: 32 }}>
          A HIPAA Business Associate Agreement (BAA) is executed with all customers as a condition of access.
        </p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'Is my client data used to train AI?',
    a: 'No. Client data entered into myABA.ai is never used to train AI models. The AI runs on Google Cloud\'s enterprise infrastructure (Vertex AI), where Google\'s data processing terms explicitly prohibit using customer data for model training. Your clients\' information stays yours.',
  },
  {
    q: 'Is this actually HIPAA compliant — not just "compliant-ish"?',
    a: 'Yes. A signed Business Associate Agreement (BAA) is required before any organization gets access. All data is encrypted in transit and at rest. Every request passes through two layers of AI governance: DLP scanning runs on every input and blocks non-clinical identifiers — Social Security numbers, payment card data, and similar — that have no place in a clinical AI prompt. Clinical context (names, diagnoses, session details) passes through so responses remain coherent and useful. On the output side, our ACLX content governance engine scores every AI response before it reaches users, with hard-block rules for specially protected categories like substance use records and HIV status. These protections go well beyond baseline HIPAA.',
  },
  {
    q: 'What AI model powers myABA.ai?',
    a: 'We use Google\'s Gemini models, running on Google Cloud\'s Vertex AI — chosen for their strong clinical-reasoning accuracy and safety characteristics. Because the AI runs on Google Cloud\'s infrastructure, the AI layer is covered under Google\'s enterprise HIPAA compliance program. We evaluate model updates carefully before rolling them to production.',
  },
  {
    q: 'What happens when the 14-day Solo trial ends?',
    a: 'We\'ll reach out before your trial expires to discuss next steps. During the pathfinder period, nothing cuts off automatically — we work with each organization individually to figure out the right fit.',
  },
  {
    q: 'What EHR systems does myABA.ai connect to?',
    a: 'We currently offer live integrations with CentralReach and Rethink — two of the most widely used practice management platforms in ABA. Admins connect by entering API credentials once; from there, client records can be searched and synced directly into myABA.ai. For organizations using OfficePuzzle, we support file-based import: export your client roster as an Excel or CSV file and upload it to create client records in bulk. We\'re actively evaluating additional EHR connections based on what our pathfinder agencies use.',
  },
  {
    q: 'What does ACLX mean and why does it matter?',
    a: 'ACLX is our AI content governance engine. Every response the AI generates is scored and classified before it reaches your team — not just for general PHI, but for specially protected categories like substance use disorder records, psychotherapy notes, and HIV status, which carry stricter legal protections than standard HIPAA PHI. If a response triggers a hard-block rule, it is withheld entirely. If it triggers a review threshold, it is held in a queue until an admin approves it. ACLX runs on every chat response and every generated document, with a full audit trail.',
  },
  {
    q: 'Is myABA.ai ready for the upcoming HIPAA Security Rule changes?',
    a: 'Yes — and by design. HHS proposed significant updates to the HIPAA Security Rule in 2025, including eliminating the distinction between "required" and "addressable" implementation specifications, making multi-factor authentication mandatory, requiring encryption of ePHI at rest and in transit, and mandating comprehensive audit logging and access controls. myABA.ai already enforces all of these: MFA is mandatory and cannot be disabled, all data is encrypted at rest (AES-256) and in transit (TLS 1.3), every AI call is audit-logged with a full decision trail, and access is governed by role-based controls with session timeouts. We built to where the rules are heading, not just where they are today.',
  },
  {
    q: 'Do I need IT involvement to get started?',
    a: 'Not for Solo or Team. You sign in with Google or email, invite your team, and you\'re up and running. Enterprise deployments that require identity federation (SAML / OIDC) will involve your IT team for the initial setup, but day-to-day use requires no technical administration.',
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section style={{ background: '#F8FBFF', padding: '96px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E88FF', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 36px)', fontWeight: 800, color: '#1E3347', letterSpacing: '-0.02em' }}>
            Common questions
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQS.map((faq, i) => (
            <div
              key={i}
              style={{
                borderTop: '1px solid #E4EEF3',
                ...(i === FAQS.length - 1 ? { borderBottom: '1px solid #E4EEF3' } : {}),
              }}
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: '20px 0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600, color: '#1E3347', lineHeight: 1.4 }}>{faq.q}</span>
                <span style={{
                  fontSize: 20, color: '#1E88FF', flexShrink: 0, lineHeight: 1,
                  transform: open === i ? 'rotate(45deg)' : 'none',
                  transition: 'transform 0.2s',
                  display: 'inline-block',
                }}>+</span>
              </button>
              {open === i && (
                <div style={{ paddingBottom: 20 }}>
                  <p style={{ fontSize: 14, color: '#5A7184', lineHeight: 1.7, margin: 0 }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#A0ADB8', marginTop: 40 }}>
          Have a question not covered here?{' '}
          <a href="mailto:hello@myaba.ai" style={{ color: '#1E88FF' }}>hello@myaba.ai</a>
        </p>
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
      background: 'linear-gradient(135deg, #0C2318 0%, #0F2A3D 100%)',
      padding: '72px 24px',
      textAlign: 'center',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: 'rgba(63,155,47,0.15)',
          border: '1px solid rgba(63,155,47,0.35)',
          borderRadius: 20, padding: '5px 14px', marginBottom: 22,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 5px #4ADE80' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#4ADE80', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Now accepting pathfinder agencies
          </span>
        </div>

        <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', marginBottom: 14 }}>
          Shape the platform from the start
        </h2>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', marginBottom: 14, lineHeight: 1.65 }}>
          We're working closely with a select group of ABA agencies to measure real-world impact,
          refine the product, and get clinical documentation right before we open broadly.
        </p>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginBottom: 36, lineHeight: 1.6 }}>
          Pathfinder partners get early access, direct input on the roadmap, and preferred pricing
          when we launch publicly.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <a
            href="mailto:hello@myaba.ai?subject=Pathfinder%20Agency%20Interest"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 32px', fontSize: 15, fontWeight: 700,
              color: 'white',
              background: 'linear-gradient(135deg, #3F9B2F, #2E7D22)',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(63,155,47,0.4)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(63,155,47,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(63,155,47,0.4)'; }}
          >
            Express Interest <IconArrow />
          </a>
          <a
            href={APP_URL}
            style={{
              padding: '14px 28px', fontSize: 15, fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              border: '1.5px solid rgba(255,255,255,0.25)',
              borderRadius: 10,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
          >
            Partner Sign In
          </a>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────
export function Footer() {
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
              { label: 'Join Waitlist', href: 'mailto:hello@myaba.ai?subject=Pathfinder%20Waitlist%20Interest' },
              { label: 'Status', href: '#' },
              { label: 'Documentation', href: '/documents' },
            ])}
            {col('Company', [
              { label: 'About', href: '#' },
              { label: 'Contact', href: 'mailto:hello@myaba.ai' },
              { label: 'Privacy Policy', href: '/privacy' },
              { label: 'Terms of Service', href: '/terms' },
              { label: 'Security', href: '/documents?tab=compliance' },
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
function HomePage() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Security />
        <Pricing />
        <FAQ />
        <CTABanner />
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route path="/dpa" element={<LegalPage kind="dpa" />} />
    </Routes>
  );
}
