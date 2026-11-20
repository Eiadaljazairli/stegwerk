export const LinkOeffnen = ({ url }: { url: string | null | undefined }) =>
  url === null || url === undefined || !url.startsWith('https://') ? null : (
    <a
      className="detail-field__link"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      Öffnen
    </a>
  );
