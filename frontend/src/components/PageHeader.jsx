import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const PageHeader = ({ title, icon: Icon, actions, backTo, backLabel = 'Volver' }) => (
  <header className="compact-page-header">
    <div className="compact-page-header__accent" aria-hidden="true" />
    <div className="compact-page-header__main">
      {backTo && <Link className="compact-page-header__back" to={backTo}><ArrowLeft size={14} /> {backLabel}</Link>}
      <div className="compact-page-header__title-row">
        {Icon && <span className="compact-page-header__icon"><Icon size={19} /></span>}
        <div>
          <h1>{title}</h1>
        </div>
      </div>
    </div>
    {actions && <div className="compact-page-header__actions">{actions}</div>}
  </header>
);

export default PageHeader;
