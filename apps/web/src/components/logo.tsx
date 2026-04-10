/**
 * OpenForge Logo Mark — 单一路径铁砧 + 浮动方块（锻造中的低代码积木）
 *
 * 铁砧结构（从上到下）：砧角(horn) → 砧面(face) → 砧腰(waist) → 砧座(base)
 * 全部由一条连续路径绘制，确保无缝隙。
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Floating blocks — low-code components being "forged" */}
      <rect
        x="12" y="1.5" width="3" height="3" rx="0.6"
        transform="rotate(35 13.5 3)"
        opacity="0.7"
      />
      <rect
        x="19" y="0.5" width="2.2" height="2.2" rx="0.4"
        transform="rotate(20 20.1 1.6)"
        opacity="0.45"
      />

      {/* Anvil — single unified path */}
      <path d="M2 11.5L8 8H26Q28.5 8 28.5 10.5V13Q28.5 15.5 26 15.5H23V20H26Q28.5 20 28.5 22V24Q28.5 26 26 26H7Q5 26 5 24V22Q5 20 7 20H11V15.5H8L2 13Z" />
    </svg>
  );
}

/**
 * Full logo: mark + wordmark
 */
export function Logo({
  size = 24,
  showText = true,
  className,
}: {
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} className="text-primary" />
      {showText && (
        <span className="text-lg font-bold tracking-tight">
          OpenForge
        </span>
      )}
    </div>
  );
}
