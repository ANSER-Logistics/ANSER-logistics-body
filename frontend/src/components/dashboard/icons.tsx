import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(children: React.ReactNode, props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => base(<path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />, p);
export const BoxIcon = (p: IconProps) => base(<path d="M12 3 3 7.5 12 12l9-4.5L12 3ZM3 7.5v9L12 21l9-4.5v-9M12 12v9" />, p);
export const WarehouseIcon = (p: IconProps) => base(<path d="M3 21V9l9-5 9 5v12H3Zm5-6h8v6H8v-6Z" />, p);
export const FactoryIcon = (p: IconProps) => base(<path d="M3 21V11l6 4v-4l6 4v-4l6 4v6H3Zm3-14V5h2v2m5 0V5h2v2" />, p);
export const ChartIcon = (p: IconProps) => base(<path d="M4 19V5m4 14v-8m4 8V9m4 10V4m4 15v-6" />, p);
export const BoltIcon = (p: IconProps) => base(<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />, p);
export const SearchIcon = (p: IconProps) => base(<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />, p);
export const BellIcon = (p: IconProps) => base(<path d="M15 17H4l1.4-1.4A2 2 0 0 0 6 14.2V11a6 6 0 0 1 12 0v3.2c0 .53.21 1.04.6 1.4L20 17H9m6 0v1a3 3 0 1 1-6 0v-1" />, p);
export const ChevronDownIcon = (p: IconProps) => base(<path d="m6 9 6 6 6-6" />, p);
export const ArrowDownIcon = (p: IconProps) => base(<path d="M12 5v14m0 0-6-6m6 6 6-6" />, p);
export const ArrowUpIcon = (p: IconProps) => base(<path d="M12 19V5m0 0-6 6m6-6 6 6" />, p);
export const AlertTriangleIcon = (p: IconProps) => base(<path d="m12 3 9 16H3L12 3Zm0 6v4m0 3h.01" />, p);
export const PlusIcon = (p: IconProps) => base(<path d="M12 5v14m-7-7h14" />, p);
export const TruckIcon = (p: IconProps) => base(<path d="M3 16V6h11v10M3 16h11m0 0h3l3-4h-6v4Zm-9 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0Zm10 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z" />, p);
export const EditIcon = (p: IconProps) => base(<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />, p);
export const TrashIcon = (p: IconProps) => base(<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />, p);
export const XIcon = (p: IconProps) => base(<path d="M18 6 6 18M6 6l12 12" />, p);
export const StaffIcon = (p: IconProps) =>
  base(
    <path d="M4 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 5a4 4 0 0 1 3 3.86V20m-2-14a2.5 2.5 0 0 1 0 5" />,
    p,
  );
export const SettingsIcon = (p: IconProps) =>
  base(
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2-1.2L15 3H9l-.4 2.6a8 8 0 0 0-2.1 1.2l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.1 1.2L9 21h6l.4-2.6a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.07-.4.1-.8.1-1.2Z" />,
    p,
  );
export const ReceiptIcon = (p: IconProps) =>
  base(
    <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Zm2 5h8m-8 4h8m-8 4h5" />,
    p,
  );
export const UsersIcon = (p: IconProps) =>
  base(
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9 10v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75" />,
    p,
  );
