declare module "@/components/BorderGlow" {
  import type { ReactNode, CSSProperties } from "react";

  interface BorderGlowProps {
    children?: ReactNode;
    className?: string;
    edgeSensitivity?: number;
    glowColor?: string;
    backgroundColor?: string;
    borderRadius?: number;
    glowRadius?: number;
    glowIntensity?: number;
    coneSpread?: number;
    animated?: boolean;
    colors?: string[];
    fillOpacity?: number;
    style?: CSSProperties;
  }

  const BorderGlow: (props: BorderGlowProps) => JSX.Element;
  export default BorderGlow;
}
