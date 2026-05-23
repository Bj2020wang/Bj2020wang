import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** 窄屏布局（与 Tailwind md 断点一致：宽度小于 768px） */
export function useIsMobileLayout(maxWidthPx = 768): boolean {
  return useMediaQuery(`(max-width: ${maxWidthPx}px)`);
}
