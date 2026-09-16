import { useEffect } from 'react';
import { useOrganization } from '../context/OrganizationContext';

export const useDocumentTitle = (pageTitle) => {
  const { branding } = useOrganization();

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} - ${branding.nombreComercial}` : branding.nombreComercial;
  }, [pageTitle, branding.nombreComercial]);
};
