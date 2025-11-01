export function onMessage(taskId: string, callback) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { params } = request
    if (request.taskId === taskId) {
      const result = callback(params)
      if (result && result.then) {
        result.then((info) => {
          sendResponse(info)
        })
      }
      else {
        sendResponse(result)
      }
    }
  })
}

export function sendMessage(taskId: string, params: any) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        taskId,
        params,
      },
      (result) => {
        resolve(result)
      },
    )
  })
}

export async function getCache(keyName: string): Promise<any> {
  return await sendMessage('get-value-bg', {
    keyName,
  })
}

export async function setCache(keyName: string, value: any) {
  return await sendMessage('set-value-bg', {
    keyName,
    value,
  })
}

export async function delCache(keyName: string) {
  return await sendMessage('del-value-bg', {
    keyName,
  })
}
