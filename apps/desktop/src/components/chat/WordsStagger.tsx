"use client";

import React, { useRef } from "react";
import { motion, type Transition } from "framer-motion";
import { cn } from "@/lib/utils";

interface WordsStaggerProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  speed?: number;
}


export function WordsStagger({
  children,
  className,
  delay = 0,
  stagger = 0.08,
  speed = 0.5,
}: WordsStaggerProps) {
  const text = React.Children.toArray(children)
    .filter((child) => typeof child === "string")
    .join("");

  const words = text.split(" ").filter((word) => word.length > 0);

  // Track previously rendered word count so we can split old vs new
  const prevCountRef = useRef(0);
  const prevCount = prevCountRef.current;
  prevCountRef.current = words.length;

  const oldWords = words.slice(0, prevCount);
  const newWords = words.slice(prevCount);

  const customTransition: Transition = {
    type: "tween",
    ease: "easeOut",
    duration: speed,
  };

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const customWordVariants = {
    hidden: {
      opacity: 0,
      y: 10,
      filter: "blur(10px)",
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: customTransition,
    },
  };

  return (
    <span className={cn("inline flex-wrap", className)}>
      {/* Old words — already visible, no animation */}
      {oldWords.map((word, index) => (
        <span key={`old-${index}`} className="inline-block">
          {word}
          {(index < oldWords.length - 1 || newWords.length > 0) && (
            <span className="inline-block">&nbsp;</span>
          )}
        </span>
      ))}

      {/* New words — stagger in with blur */}
      {newWords.length > 0 && (
        <motion.span
          key={`batch-${prevCount}`}
          className="inline"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {newWords.map((word, index) => (
            <motion.span
              key={`new-${prevCount + index}`}
              className="inline-block"
              variants={customWordVariants}
            >
              {word}
              {index < newWords.length - 1 && (
                <span className="inline-block">&nbsp;</span>
              )}
            </motion.span>
          ))}
        </motion.span>
      )}
    </span>
  );
}
