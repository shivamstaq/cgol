interface IconProps {
  path: string;
  className?: string;
}

function Icon({ path, className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const PlayIcon = () => <Icon path="M8 5l11 7-11 7V5z" />;
export const DrawIcon = () => <Icon path="M4 20h4L20 8a2.8 2.8 0 00-4-4L4 16v4z" />;
export const StepIcon = () => <Icon path="M6 5l9 7-9 7V5zm12 0v14" />;
export const ResetIcon = () => (
  <Icon path="M4 4v6h6M20 20v-6h-6M5 14a7 7 0 0012 3M19 10A7 7 0 007 7" />
);
export const ClearIcon = () => <Icon path="M6 6l12 12M18 6L6 18" />;
export const GripIcon = () => (
  <Icon path="M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01" className="h-4 w-4" />
);
export const BrushIcon = () => (
  <Icon path="M9.5 14.5L4 20l5.5-1 8-8-3-3-8 8-1 5.5M15 6l3 3 2.5-2.5a2.1 2.1 0 00-3-3L15 6z" />
);
export const PresetsIcon = () => <Icon path="M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z" />;
export const RulesIcon = () => <Icon path="M4 7h16M4 12h10M4 17h7" />;
export const LookIcon = () => (
  <Icon path="M12 3a9 9 0 100 18 3 3 0 002-5.2A2.8 2.8 0 0116 13h2a3 3 0 003-3 7 7 0 00-9-7z" />
);
export const HelpIcon = () => (
  <Icon path="M9.5 9a2.6 2.6 0 015 1c0 1.7-2.5 2-2.5 4M12 17.5h.01M12 21a9 9 0 100-18 9 9 0 000 18z" />
);
export const FullscreenIcon = () => <Icon path="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />;
export const MoreIcon = () => <Icon path="M5 12h.01M12 12h.01M19 12h.01" />;
