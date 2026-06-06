import { useEffect, useState } from "react";
import type { HeaderFormat } from "../lib/videhTemplate";
import {
  type HeaderMediaValidation,
  validateHeaderMediaUrl,
} from "../lib/templateHeaderMedia";

export function useHeaderMediaValidation(
  format: HeaderFormat,
  url: string,
): HeaderMediaValidation {
  const [validation, setValidation] = useState<HeaderMediaValidation>({ state: "idle" });

  useEffect(() => {
    if (format !== "IMAGE" && format !== "VIDEO") {
      setValidation({ state: "idle" });
      return;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      setValidation({ state: "idle" });
      return;
    }

    let cancelled = false;
    setValidation({ state: "loading" });

    const timer = window.setTimeout(() => {
      void validateHeaderMediaUrl(format, trimmed).then((result) => {
        if (!cancelled) setValidation(result);
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [format, url]);

  return validation;
}
