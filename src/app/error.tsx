"use client";

import { useEffect } from "react";

import { clientDebug } from "@/lib/debug";

import styles from "./page.module.css";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    clientDebug("Application error boundary caught an error", {
      digest: error.digest,
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Something went wrong</p>
          <h1>We hit an unexpected error.</h1>
          <p>You can try again, or reload the page and start from a fresh setlist.</p>
          <button className={styles.primaryButton} type="button" onClick={reset}>
            Try again
          </button>
        </section>
      </main>
    </div>
  );
}
