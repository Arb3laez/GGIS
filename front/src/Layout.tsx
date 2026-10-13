import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { Bell, FilePlus2, FileText, LayoutGrid, Search, Settings, X } from 'lucide-react';
import { useCompanyProfile, useDashboard } from './api/queries';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'G') + (parts[1]?.[0] ?? 'G')).toUpperCase();
}

export function Layout() {
  const navigate = useNavigate();
  const { data: company } = useCompanyProfile();
  const { data: dashboard } = useDashboard();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const pending = dashboard?.followUps.length ?? 0;
  const { pathname, hash } = useLocation();

  // Enlaces con ancla (#seguimientos, #cierre): desplazarse cuando la sección ya se pintó.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(
      () => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }),
      350,
    );
    return () => clearTimeout(t);
  }, [pathname, hash]);

  function submitSearch() {
    navigate(q.trim() ? `/quotes?q=${encodeURIComponent(q.trim())}` : '/quotes');
    setSearching(false);
    setQ('');
  }

  return (
    <div className="wrap">
      <div className="shell">
        <header className="topbar no-print">
          <Link to="/" className="logo-mark" aria-label="Inicio">
            <img src="/brand/gyg-mark.png" alt="" />
          </Link>
          <nav className="pill-nav" aria-label="Principal">
            <NavLink to="/" end>
              <LayoutGrid size={16} /> <span className="label">Resumen</span>
            </NavLink>
            <NavLink to="/quotes" end>
              <FileText size={16} /> <span className="label">Cotizaciones</span>
              {pending ? (
                <span className="count" title="Seguimientos pendientes">
                  {pending}
                </span>
              ) : null}
            </NavLink>
            <NavLink to="/quotes/new">
              <FilePlus2 size={16} /> <span className="label">Nueva cotización</span>
            </NavLink>
            <NavLink to="/settings">
              <Settings size={16} /> <span className="label">Configuración</span>
            </NavLink>
          </nav>
          <div className="top-actions">
            {searching ? (
              <form
                className="search-pop"
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitSearch();
                }}
              >
                <Search size={15} />
                <input
                  autoFocus
                  value={q}
                  placeholder="Cliente, proyecto u OT…"
                  aria-label="Buscar cotización"
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label="Cerrar búsqueda"
                  onClick={() => setSearching(false)}
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="icon-btn"
                aria-label="Buscar cotización"
                onClick={() => setSearching(true)}
              >
                <Search size={17} />
              </button>
            )}
            <Link
              to="/#seguimientos"
              className="btn icon-btn"
              aria-label={`${pending} seguimientos pendientes`}
              title="Seguimientos pendientes"
              style={{ position: 'relative' }}
            >
              <Bell size={17} />
              {pending ? (
                <span
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 9,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                />
              ) : null}
            </Link>
            <Link
              to="/settings"
              className="avatar"
              title={company?.signatoryName || 'Configurar perfil'}
              style={{ textDecoration: 'none' }}
            >
              {initials(company?.signatoryName || company?.tradeName || 'G G')}
            </Link>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
        <ScrollRestoration />
      </div>
    </div>
  );
}
