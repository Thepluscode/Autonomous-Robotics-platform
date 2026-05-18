import React, { useState } from "react";
import { Button } from "../ui/button";
import { Copy, CheckCircle2 } from "lucide-react";
import { toast } from "../../lib/toast";

export function CopyButton({ text, label = "Copy", iconOnly = false }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Couldn't copy", { description: err.message });
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5"
      aria-label={iconOnly ? label : undefined}
      data-testid="copy-button"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {iconOnly ? null : copied ? "Copied" : label}
    </Button>
  );
}
