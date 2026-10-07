import { cn } from "@/lib/utils";

// Quarter ring (loading-ui.com) — hanya kuadran top-right yang dicat,
// jadi ringan untuk full-page overlay tapi tetap jelas.
// Keyframes + reduced-motion ada di app/globals.css (class .quarter-ring)
// agar tidak inject <style> per render. Warna via currentColor,
// ukuran via size-* (default size-4, override pakai twMerge),
// durasi via --duration (default 1s).

function QuarterRing({
  className,
  style,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      className={cn(
        "quarter-ring inline-block size-4 rounded-full border-t-[3px] border-r-[3px] border-t-current border-r-transparent",
        className
      )}
      style={style}
      {...props}
    >
      <span className="sr-only">Loading</span>
    </span>
  );
}

export { QuarterRing };
