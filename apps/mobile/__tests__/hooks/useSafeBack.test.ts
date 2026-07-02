import { renderHook } from '@testing-library/react-native';
import { useSafeBack } from '../../hooks/useSafeBack';

// expo-router ya está mockeado globalmente; aquí lo sobreescribimos
// para poder manipular canGoBack por test.
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(),
  },
}));

describe('useSafeBack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('llama router.back() cuando canGoBack() es true', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(true);

    const { result } = renderHook(() => useSafeBack());
    result.current();

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('llama router.replace("/(tabs)") cuando canGoBack() es false', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/consistent-type-imports
    const { router } = require('expo-router') as typeof import('expo-router');
    (router.canGoBack as jest.Mock).mockReturnValue(false);

    const { result } = renderHook(() => useSafeBack());
    result.current();

    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    expect(router.back).not.toHaveBeenCalled();
  });
});
