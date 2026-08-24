import type { SVGAttributes } from 'react';

export type LogoProps = SVGAttributes<SVGSVGElement>;

export const BrandingLogo = ({ className = 'h-6 w-auto', ...props }: LogoProps) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 190 36"
      className={className}
      aria-label="Crove Sign"
      {...props}
    >
      {/* Crove Icon Mark */}
      <rect x="0" y="2" width="32" height="32" rx="8" fill="#10B981" />
      <path
        d="M9 18.5C9 14 12.5 10.5 17 10.5C20.5 10.5 23 12.5 23.5 15M23 15L20.5 25.5C20 27 18.5 28 17 28C14.5 28 12.5 26 12.5 23.5C12.5 20.5 16 19 23 19"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Brand Name "Crove" */}
      <text
        x="42"
        y="25"
        fontFamily="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="21"
        fontWeight="800"
        fill="currentColor"
        letterSpacing="-0.5px"
      >
        Crove
      </text>
      {/* Product Tag "SIGN" */}
      <rect x="110" y="7" width="58" height="22" rx="6" fill="#10B981" fillOpacity="0.15" />
      <text
        x="139"
        y="22.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="12"
        fontWeight="700"
        fill="#10B981"
        letterSpacing="1px"
      >
        SIGN
      </text>
    </svg>
  );
};

