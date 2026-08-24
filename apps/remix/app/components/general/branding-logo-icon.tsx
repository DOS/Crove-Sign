import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

export const BrandingLogoIcon = ({ className = 'h-6 w-auto', ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      className={className}
      aria-label="Crove Sign Icon"
      {...props}
    >
      <rect x="2" y="2" width="32" height="32" rx="8" fill="#10B981" />
      <path
        d="M11 18.5C11 14 14.5 10.5 19 10.5C22.5 10.5 25 12.5 25.5 15M25 15L22.5 25.5C22 27 20.5 28 19 28C16.5 28 14.5 26 14.5 23.5C14.5 20.5 18 19 25 19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

