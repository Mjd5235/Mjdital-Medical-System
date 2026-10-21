type IconProps = {
  className?: string;
};

export function ReceptionPortalIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="12"
        y="16"
        width="28"
        height="32"
        rx="4"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M12 24h28"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 16v-3.5M32 16v-3.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M18 32h6M18 38h10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="44.5" cy="36" r="7.5" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M34 54c1.2-7.2 5.6-11 10.5-11S53.8 46.8 55 54"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DoctorPortalIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M18 14v10c0 8 6.2 14.5 14 14.5S46 32 46 24V14"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="18" cy="14" r="4" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="46" cy="14" r="4" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M32 38.5V44"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect
        x="36"
        y="36"
        width="16"
        height="18"
        rx="3"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M44 42v6M41 45h6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AdminPortalIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M32 10 14 18v14.5c0 12.2 7.6 20.6 18 23.5 10.4-2.9 18-11.3 18-23.5V18L32 10Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="30" r="5.5" stroke="currentColor" strokeWidth="2.4" />
      <path
        d="M32 35.5V42"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
