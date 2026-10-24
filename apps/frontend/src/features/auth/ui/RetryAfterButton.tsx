import { useEffect, useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Button } from '../../../shared/ui';

type Props = { seconds: number; onRetry: () => void };

/** Enabled once the server's Retry-After has passed. The tick is visual only: no live region speaks each second. */
export function RetryAfterButton({ seconds, onRetry }: Props) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Button variant="secondary" icon="retry" isDisabled={left > 0} onPress={onRetry}>
      {left > 0 ? ru.login.retryIn(left) : ru.common.retry}
    </Button>
  );
}
