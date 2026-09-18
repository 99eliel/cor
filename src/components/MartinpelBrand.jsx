import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';

export default function MartinpelBrand({ compact = false, subtitle = 'Plataforma de Personalização', className = '' }) {
  return (
    <div className={`martinpel-brand ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <div className="martinpel-brand-logo">
        <img src={MARTINPEL_LOGO_DATA_URL} alt="Martinpel Uniformes e EPI's" />
      </div>
      <div className="martinpel-brand-copy">
        <strong>Plataforma Martinpel</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
