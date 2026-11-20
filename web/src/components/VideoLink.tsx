export const VideoLink = ({ href }: { href: string | null | undefined }) => {
  if (href === null || href === undefined || !href.startsWith('https://')) {
    return null;
  }

  return (
    <a
      className="video-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Videokonferenz beitreten
    </a>
  );
};
