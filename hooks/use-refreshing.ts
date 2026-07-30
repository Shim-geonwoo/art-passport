// 당겨서 새로고침(RefreshControl)에 필요한 상태와 손잡이를 한 번에 만들어 주는 훅.
//
// 화면마다 하는 일이 똑같다: 당기면 표시를 켜고 → 서버에서 다시 받아오고 → 표시를 끈다.
// 이 여섯 줄을 화면마다 베껴 쓰면 다섯 군데가 되므로 여기 한 곳에 모아둔다.
//
// 쓰는 쪽은 두 줄이면 된다:
//   const { isRefreshing, onRefresh } = useRefreshing(refresh);
//   <ScrollView refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>

import { useCallback, useState } from 'react';

export function useRefreshing(refresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      // Provider의 refresh()는 실패해도 스스로 error에 담고 끝내지만(예외를 밖으로 던지지 않는다),
      // 혹시 던지더라도 새로고침 표시가 계속 돌지 않도록 finally에서 내린다.
      setIsRefreshing(false);
    }
  }, [refresh]);

  return { isRefreshing, onRefresh };
}
