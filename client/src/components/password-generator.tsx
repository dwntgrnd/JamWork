import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Copy, Check, RefreshCw } from 'lucide-react';

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*';
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;

function randomChar(charset: string): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return charset[array[0] % charset.length];
}

function generatePassword(): string {
  // Guarantee one from each category
  const required = [
    randomChar(UPPERCASE),
    randomChar(LOWERCASE),
    randomChar(DIGITS),
    randomChar(SYMBOLS),
  ];

  // Fill remaining 12 from full set
  const remaining = Array.from({ length: 12 }, () => randomChar(ALL_CHARS));
  const all = [...required, ...remaining];

  // Shuffle (Fisher-Yates)
  for (let i = all.length - 1; i > 0; i--) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const j = array[0] % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }

  return all.join('');
}

interface PasswordGeneratorProps {
  onGenerate: (password: string) => void;
}

export function PasswordGenerator({ onGenerate }: PasswordGeneratorProps) {
  const [password, setPassword] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(() => {
    const pw = generatePassword();
    setPassword(pw);
    setVisible(true);
    setCopied(false);
    onGenerate(pw);
  }, [onGenerate]);

  const handleCopy = useCallback(async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: select the text for manual copy
    }
  }, [password]);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        className="gap-1.5"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Generate password
      </Button>

      {password && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded text-sm font-mono">
          <span className="flex-1 select-all break-all">
            {visible ? password : '\u2022'.repeat(password.length)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={() => setVisible(!visible)}
            title={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex-shrink-0"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
