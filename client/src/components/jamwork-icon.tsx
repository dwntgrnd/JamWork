import iconUrl from '@/assets/jamwork-icon.svg';

interface JamWorkIconProps {
  className?: string;
}

export function JamWorkIcon({ className = 'h-6 w-6' }: JamWorkIconProps) {
  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={className}
    />
  );
}
