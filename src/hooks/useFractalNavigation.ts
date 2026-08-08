import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  formatNavigation,
  navigationFromView,
  parseNavigation,
  type Navigation,
} from '../engine/viewport';
import { getDefaultView, type FractalAlgorithm } from '../util/fractals';

type UseFractalNavigationOptions = Readonly<{
  algorithm: FractalAlgorithm;
  loc?: string;
  resetSignal: number;
  autoUpdateUrl: boolean;
}>;

type FractalNavigation = Readonly<{
  navigation: Navigation;
  setNavigation: Dispatch<SetStateAction<Navigation>>;
}>;

export const useFractalNavigation = ({
  algorithm,
  loc,
  resetSignal,
  autoUpdateUrl,
}: UseFractalNavigationOptions): FractalNavigation => {
  const location = useLocation();
  const navigate = useNavigate();
  const defaultView = useMemo(() => getDefaultView(algorithm), [algorithm]);
  const [navigation, setNavigation] = useState<Navigation>(() =>
    parseNavigation(loc, defaultView),
  );
  const routeSourceKey = `${algorithm}|${loc ?? ''}`;
  const appliedRouteSourceRef = useRef(routeSourceKey);
  const handledResetSignalRef = useRef(resetSignal);
  const suppressUrlWriteRef = useRef(false);

  useEffect(() => {
    if (appliedRouteSourceRef.current === routeSourceKey) {
      return;
    }
    appliedRouteSourceRef.current = routeSourceKey;
    suppressUrlWriteRef.current = true;
    const nextNavigation = parseNavigation(loc, defaultView);
    setNavigation((current) =>
      formatNavigation(current) === formatNavigation(nextNavigation)
        ? current
        : nextNavigation,
    );
  }, [defaultView, loc, routeSourceKey]);

  useEffect(() => {
    if (handledResetSignalRef.current === resetSignal) {
      return;
    }
    handledResetSignalRef.current = resetSignal;
    setNavigation(navigationFromView(defaultView));
  }, [defaultView, resetSignal]);

  useEffect(() => {
    if (suppressUrlWriteRef.current) {
      suppressUrlWriteRef.current = false;
      return;
    }
    if (!autoUpdateUrl) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    searchParams.delete('loc');
    searchParams.delete('x');
    searchParams.delete('y');
    searchParams.delete('z');
    const nextPath = `/${algorithm}/${formatNavigation(navigation)}`;
    const nextSearch = searchParams.toString();
    const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}`;
    if (`${location.pathname}${location.search}` !== nextUrl) {
      navigate(nextUrl, { replace: true });
    }
  }, [
    algorithm,
    autoUpdateUrl,
    location.pathname,
    location.search,
    navigate,
    navigation,
  ]);

  return { navigation, setNavigation };
};
