import { useEffect, useState } from 'react';
import { companyProfileSchema, type CompanyProfile } from '@ggis/domain';
import { useCompanyProfile, useSaveCompanyProfile } from '../../api/queries';
import { errorMessage, useToast } from '../../shared/feedback';
import { Building2, Save } from 'lucide-react';
import { TextArea, TextField } from '../../shared/inputs';
import { SectionTitle } from '../../shared/SectionTitle';

const FIELDS: Array<[keyof CompanyProfile, string, 'text' | 'area']> = [
  ['legalName', 'Razón social', 'text'],
  ['tradeName', 'Nombre comercial', 'text'],
  ['address', 'Dirección de la oficina', 'text'],
  ['city', 'Ciudad', 'text'],
  ['phones', 'Teléfonos', 'text'],
  ['signatoryName', 'Nombre de quien firma la oferta', 'text'],
  ['signatoryTitle', 'Cargo de quien firma', 'text'],
  ['signatoryContact', 'Contacto en la firma (correo · teléfono)', 'text'],
  ['slogan', 'Eslogan', 'text'],
  ['dropboxBasePath', 'Carpeta base de Dropbox (se le agrega la unidad de negocio)', 'text'],
  ['about', '"Quiénes somos" en la oferta', 'area'],
];

export function SettingsPage() {
  const { data } = useCompanyProfile();
  const save = useSaveCompanyProfile();
  const notify = useToast();
  const [form, setForm] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <div className="empty">Cargando…</div>;

  return (
    <>
      <div className="editor-head">
        <div>
          <div className="kicker">Datos que salen en la oferta y el correo</div>
          <h1>Configuración</h1>
        </div>
      </div>
      <section className="card">
        <SectionTitle icon={<Building2 size={16} />}>Empresa y firma</SectionTitle>
        <div className="sub">Se guardan en el servidor, no en el código.</div>
        <div className="grid-2">
          {FIELDS.filter(([, , t]) => t === 'text').map(([key, label]) => (
            <TextField
              key={key}
              label={label}
              value={form[key]}
              onChange={(v) => setForm({ ...form, [key]: v })}
            />
          ))}
        </div>
        {FIELDS.filter(([, , t]) => t === 'area').map(([key, label]) => (
          <TextArea
            key={key}
            label={label}
            value={form[key]}
            rows={4}
            onChange={(v) => setForm({ ...form, [key]: v })}
          />
        ))}
        <button
          type="button"
          className="primary"
          style={{ marginTop: 12 }}
          disabled={save.isPending}
          onClick={() => {
            const parsed = companyProfileSchema.safeParse(form);
            if (!parsed.success) return notify(parsed.error.issues[0]?.message ?? 'Datos inválidos', true);
            save.mutate(parsed.data, {
              onSuccess: () => notify('✓ Configuración guardada'),
              onError: (e) => notify(errorMessage(e), true),
            });
          }}
        >
          <Save size={16} /> Guardar configuración
        </button>
      </section>
    </>
  );
}
