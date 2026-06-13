import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('react-native-google-mobile-ads', () => ({
  AdsConsent: {
    requestInfoUpdate: jest.fn(),
    showForm: jest.fn(),
  },
  AdsConsentStatus: { REQUIRED: 'REQUIRED' },
}));

jest.mock('../../stores/preferencesStore', () => ({
  usePreferencesStore: jest.fn(),
}));

import { useGdprConsent } from '../../hooks/useGdprConsent';
import { usePreferencesStore } from '../../stores/preferencesStore';

type AdmobMock = { AdsConsent: { requestInfoUpdate: jest.Mock; showForm: jest.Mock } };
const { AdsConsent } = jest.requireMock('react-native-google-mobile-ads') as AdmobMock;
const mockUsePreferencesStore = usePreferencesStore as unknown as jest.Mock;

describe('useGdprConsent', () => {
  const mockSetConsentResolved = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferencesStore.mockReturnValue(mockSetConsentResolved);
  });

  it('llama setConsentResolved(true) cuando status !== REQUIRED (no se necesita formulario)', async () => {
    AdsConsent.requestInfoUpdate.mockResolvedValueOnce({
      isConsentFormAvailable: false,
      status: 'NOT_REQUIRED',
    });

    renderHook(() => useGdprConsent());

    await waitFor(() => {
      expect(mockSetConsentResolved).toHaveBeenCalledWith(true);
    });

    expect(AdsConsent.showForm).not.toHaveBeenCalled();
    expect(mockSetConsentResolved).toHaveBeenCalledTimes(1);
  });

  it('llama setConsentResolved(true) después de mostrar el formulario cuando status === REQUIRED', async () => {
    AdsConsent.requestInfoUpdate.mockResolvedValueOnce({
      isConsentFormAvailable: true,
      status: 'REQUIRED',
    });
    AdsConsent.showForm.mockResolvedValueOnce(undefined);

    renderHook(() => useGdprConsent());

    await waitFor(() => {
      expect(mockSetConsentResolved).toHaveBeenCalledWith(true);
    });

    expect(AdsConsent.showForm).toHaveBeenCalledTimes(1);
    expect(mockSetConsentResolved).toHaveBeenCalledTimes(1);
  });

  it('llama setConsentResolved(true) incluso cuando requestInfoUpdate lanza un error', async () => {
    AdsConsent.requestInfoUpdate.mockRejectedValueOnce(new Error('SDK error'));

    renderHook(() => useGdprConsent());

    await waitFor(() => {
      expect(mockSetConsentResolved).toHaveBeenCalledWith(true);
    });

    expect(mockSetConsentResolved).toHaveBeenCalledTimes(1);
  });
});
