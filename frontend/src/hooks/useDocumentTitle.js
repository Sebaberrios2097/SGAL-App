import { useEffect } from 'react';
import { useOrganization } from '../context/OrganizationContext';

export const useDocumentTitle = (pageTitle) => {
  const { displayName } = useOrganization();

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} - ${displayName}` : displayName;
  }, [pageTitle, displayName]);
};
