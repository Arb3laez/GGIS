import { Router } from 'express';
import { companyProfileSchema } from '@ggis/domain';
import { validate } from '../../lib/validate';
import type { SettingsService } from './settings.service';

export function settingsRouter(settings: SettingsService): Router {
  const r = Router();

  r.get('/company', (_req, res) => {
    res.json(settings.getCompanyProfile());
  });

  r.put('/company', (req, res) => {
    res.json(settings.saveCompanyProfile(validate(companyProfileSchema, req.body)));
  });

  return r;
}
