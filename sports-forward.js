// The old sports proxy's address (sports-proxy.pengzjay.workers.dev): every
// request handed to the main Worker, which serves /sports-proxy itself now
// (the owner, 2026-10-13: one proxy). Kept only for phones still on a kit
// from before the move and Shared-Data runs already started; it goes once
// every device has moved on (the kit updates on its next opening).
export default {
  fetch(request, env) {
    return env.ORBIT.fetch(request);
  }
};
