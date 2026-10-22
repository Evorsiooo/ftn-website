"use client";
import { cn } from "@/lib/utils";
import { IconMenu2, IconX } from "@tabler/icons-react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "motion/react";
import React, { useRef, useState } from "react";

interface NavbarProps {
  children: React.ReactNode;
  className?: string;
}

interface NavBodyProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface NavItemsProps {
  items: {
    name: string;
    link: string;
  }[];
  className?: string;
  onItemClick?: () => void;
}

interface MobileNavProps {
  children: React.ReactNode;
  className?: string;
  visible?: boolean;
}

interface MobileNavHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface MobileNavMenuProps {
  children: React.ReactNode;
  className?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const Navbar = ({ children, className }: NavbarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState<boolean>(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest > 60) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  });

  return (
    <div
      ref={ref}
      className={cn("fixed inset-x-0 top-0 z-50 w-full pt-4 px-4 pointer-events-none", className)}
    >
      <div className="pointer-events-none w-full">
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ visible?: boolean }>,
                { visible },
              )
            : child,
        )}
      </div>
    </div>
  );
};

export const NavBody = ({ children, className, visible }: NavBodyProps) => {
  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(12px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(0, 0, 0, 0.15), 0 1px 1px rgba(0, 0, 0, 0.05)"
          : "none",
        width: visible ? "60%" : "100%",
        y: visible ? 8 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 40,
      }}
      style={{
        minWidth: "680px",
      }}
      className={cn(
        "pointer-events-auto relative z-[60] mx-auto hidden w-full max-w-6xl flex-row items-center justify-between self-start rounded-full bg-white/85 border border-neutral-200/90 text-neutral-900 shadow-sm px-6 py-2.5 lg:flex backdrop-blur-md dark:bg-neutral-950/70 dark:border-neutral-800/80 dark:text-white dark:shadow-none",
        visible && "bg-white/95 border-neutral-300 shadow-md dark:bg-neutral-950/90 dark:border-neutral-700/80",
        className,
      )}
    >
      {children}
    </motion.div>
  );
};

export const NavItems = ({ items, className, onItemClick }: NavItemsProps) => {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <motion.div
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "hidden flex-1 flex-row items-center justify-center space-x-1 text-sm font-medium text-neutral-700 dark:text-neutral-300 lg:flex",
        className,
      )}
    >
      {items.map((item, idx) => (
        <a
          key={`link-${idx}`}
          href={item.link}
          target={item.link.startsWith("http") ? "_blank" : undefined}
          rel={item.link.startsWith("http") ? "noopener noreferrer" : undefined}
          onMouseEnter={() => setHovered(idx)}
          onClick={onItemClick}
          className="relative px-4 py-1.5 text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white transition duration-150 rounded-full"
        >
          {hovered === idx && (
            <motion.div
              layoutId="hovered"
              className="absolute inset-0 h-full w-full rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 -z-10"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <span className="relative z-20 text-sm font-medium">{item.name}</span>
        </a>
      ))}
    </motion.div>
  );
};

export const MobileNav = ({ children, className, visible }: MobileNavProps) => {
  return (
    <motion.div
      animate={{
        backdropFilter: visible ? "blur(12px)" : "none",
        boxShadow: visible
          ? "0 0 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05) inset"
          : "none",
        width: visible ? "95%" : "100%",
        y: visible ? 4 : 0,
      }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 40,
      }}
      className={cn(
        "pointer-events-auto relative z-50 mx-auto flex w-full max-w-[calc(100vw-2rem)] flex-col items-center justify-between rounded-2xl bg-white/90 border border-neutral-200 text-neutral-900 shadow-md px-4 py-3 lg:hidden backdrop-blur-md dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-100 dark:shadow-none",
        visible && "bg-white/95 border-neutral-300 dark:bg-neutral-950/95 dark:border-neutral-700",
        className,
      )}
    >
      {children}
    </motion.div>
  );
};

export const MobileNavHeader = ({
  children,
  className,
}: MobileNavHeaderProps) => {
  return (
    <div
      className={cn(
        "flex w-full flex-row items-center justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
};

export const MobileNavMenu = ({
  children,
  className,
  isOpen,
  onClose,
}: MobileNavMenuProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "mt-4 flex w-full flex-col items-start justify-start gap-4 border-t border-neutral-200 dark:border-neutral-800 pt-4 pb-2",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export const MobileNavToggle = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      aria-label="Toggle navigation menu"
      className="p-1 text-neutral-700 hover:text-black dark:text-neutral-300 dark:hover:text-white cursor-pointer"
    >
      {isOpen ? (
        <IconX className="h-6 w-6" />
      ) : (
        <IconMenu2 className="h-6 w-6" />
      )}
    </button>
  );
};

export const NavbarLogo = ({
  href = "/",
}: {
  href?: string;
  title?: string;
}) => {
  return (
    <a
      href={href}
      className="relative z-20 flex items-center px-2 py-1 select-none"
    >
      {/* Light Mode Logo */}
      <img
        src="/logos/ftn_text_transparent.png"
        alt="FTN News"
        className="h-5 sm:h-6 w-auto object-contain max-w-[120px] dark:hidden"
      />
      {/* Dark Mode Logo */}
      <img
        src="/logos/ftn_textwhite_transparent.png"
        alt="FTN News"
        className="h-5 sm:h-6 w-auto object-contain max-w-[120px] hidden dark:block"
      />
    </a>
  );
};

export interface NavbarButtonProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "primary" | "secondary" | "ftn-plus" | "discord";
}

export const NavbarButton = ({
  href,
  children,
  className,
  variant = "primary",
  ...props
}: NavbarButtonProps) => {
  const baseStyles =
    "px-4 py-2 rounded-full text-xs font-bold relative cursor-pointer transition duration-200 inline-flex items-center justify-center text-center";

  const variantStyles = {
    primary:
      "bg-blue-600 hover:bg-blue-700 text-white shadow-[0px_2px_0px_0px_#FFFFFF40_inset]",
    secondary:
      "bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800",
    "ftn-plus":
      "bg-[#FFBB14] hover:bg-[#e5a710] text-black font-black tracking-wide rounded-lg shadow-[0px_2px_0px_0px_#FFFFFF40_inset]",
    discord:
      "bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg shadow-[0px_2px_0px_0px_#FFFFFF40_inset]",
  };

  return (
    <a
      href={href || undefined}
      className={cn(baseStyles, variantStyles[variant], className)}
      {...props}
    >
      {children}
    </a>
  );
};
