import type { ReactNode } from 'react';

/** Título de tarjeta con ícono circular (estilo del panel). */
export function SectionTitle({
  icon,
  id,
  children,
  right,
}: {
  icon: ReactNode;
  id?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="card-head" style={{ marginBottom: 6 }}>
      <h2 className="card-title" id={id}>
        <span className="title-icon">{icon}</span>
        {children}
      </h2>
      {right}
    </div>
  );
}
