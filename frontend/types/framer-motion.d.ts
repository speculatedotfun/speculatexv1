// Type declarations for framer-motion to work with React 19
declare module 'framer-motion' {
  import * as React from 'react';
  
  export interface MotionProps {
    initial?: any;
    animate?: any;
    transition?: any;
    whileHover?: any;
    whileTap?: any;
    whileFocus?: any;
    exit?: any;
    variants?: any;
    layoutId?: any;
    className?: string;
    style?: React.CSSProperties;
    children?: React.ReactNode;
    [key: string]: any;
  }

  export const motion: {
    div: React.ComponentType<MotionProps & React.HTMLAttributes<HTMLDivElement>>;
    header: React.ComponentType<MotionProps & React.HTMLAttributes<HTMLElement>>;
    h1: React.ComponentType<MotionProps & React.HTMLAttributes<HTMLHeadingElement>>;
    span: React.ComponentType<MotionProps & React.HTMLAttributes<HTMLSpanElement>>;
    button: React.ComponentType<MotionProps & React.ButtonHTMLAttributes<HTMLButtonElement>>;
    svg: React.ComponentType<MotionProps & React.SVGProps<SVGSVGElement>>;
    [key: string]: React.ComponentType<any>;
  };

  export const AnimatePresence: React.ComponentType<{
    children?: React.ReactNode;
    mode?: 'wait' | 'sync' | 'popLayout';
    [key: string]: any;
  }>;
}
