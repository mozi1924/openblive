import { useEffect, useRef } from "react";

export function useTauriEvent<T>(
  listenFn: (handler: (payload: T) => void) => Promise<() => void>,
  handler: (payload: T) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let active = true;
    const unlistenPromise = listenFn((payload) => {
      if (active) {
        handlerRef.current(payload);
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [listenFn]);
}
