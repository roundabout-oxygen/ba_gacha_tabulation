/**
 * SCHALE ガチャ集計ツール Apps Script用バックエンドコード
 * スプレッドシートに独自のカスタムメニューを追加し、
 * シートデータと背景色を取得してサイドバーUIに渡します。
 */

function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('SCHALE ガチャ集計')
      .addItem('ダッシュボードを開く (大画面ポップアップ)', 'showDialog')
      .addItem('ダッシュボードを開く (右側サイドバー)', 'showSidebar')
      .addItem('ダッシュボードを開く (別タブ全画面表示)', 'openInNewTab')
      .addToUi();
}

function showSidebar() {
  var html = HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('SCHALE Gacha Analyzer');
  SpreadsheetApp.getUi().showSidebar(html);
}

function showDialog() {
  var html = HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('SCHALE Gacha Analyzer')
      .setWidth(1000)
      .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

function openInNewTab() {
  var webAppUrl = ScriptApp.getService().getUrl();
  var htmlContent = '';
  
  if (webAppUrl && webAppUrl.indexOf('exec') !== -1) {
    htmlContent = 
      '<div style="font-family: sans-serif; text-align: center; padding: 20px;">' +
      '  <p style="font-size: 14px; color: #374151; font-weight: 500;">別タブ（全画面）でダッシュボードを起動します...</p>' +
      '  <a href="' + webAppUrl + '" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #00aeef; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 15px; box-shadow: 0 4px 10px rgba(0,174,239,0.25);">別タブで起動する</a>' +
      '  <script>window.open("' + webAppUrl + '", "_blank"); setTimeout(function() { google.script.host.close(); }, 1200);</script>' +
      '</div>';
  } else {
    htmlContent = 
      '<div style="font-family: sans-serif; padding: 15px; font-size: 13px; line-height: 1.6; color: #374151;">' +
      '  <h3 style="margin-top: 0; color: #ff3e6c; border-bottom: 1px solid #ffd1dc; padding-bottom: 6px;">⚠️ ウェブアプリのデプロイが必要です</h3>' +
      '  <p>別タブで全画面表示するには、Apps Scriptエディタ側でウェブアプリとして公開（デプロイ）する必要があります：</p>' +
      '  <ol style="padding-left: 20px; margin: 8px 0;">' +
      '    <li>画面右上にある青い <b>「デプロイ」 ＞ 「新しいデプロイ」</b> ボタンを押します。</li>' +
      '    <li>種類の選択（歯車アイコン）で <b>「ウェブアプリ」</b> を選択します。</li>' +
      '    <li>各設定を以下のように選択します：' +
      '      <ul style="padding-left: 15px; margin: 4px 0; font-size: 12px; color: #555;">' +
      '        <li>説明: <code>SCHALE Gacha Analyzer</code> などを入力</li>' +
      '        <li>次のユーザーとして実行: <b>「自分」</b></li>' +
      '        <li>アクセスできるユーザー: <b>「全員」</b> (または自分のみ)</li>' +
      '      </ul>' +
      '    </li>' +
      '    <li>下部の青い「デプロイ」ボタンを押し、承認を求められた場合は許可します。</li>' +
      '    <li>完了画面に表示される <b>「ウェブアプリのURL」</b> をコピーしてブラウザで直接開くか、このメニューを再度実行してください。</li>' +
      '  </ol>' +
      '  <div style="text-align: center; margin-top: 15px;">' +
      '    <button onclick="google.script.host.close()" style="padding: 6px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer; font-size: 12px;">閉じる</button>' +
      '  </div>' +
      '</div>';
  }
  
  var html = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(500)
      .setHeight(webAppUrl && webAppUrl.indexOf('exec') !== -1 ? 160 : 360)
      .setTitle('別タブで開く');
  SpreadsheetApp.getUi().showModalDialog(html, ' ');
}

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('SCHALE Gacha Analyzer')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * シートデータを取得する関数
 * A列からM列の値を読み取り、セルの背景色情報と合わせてJSONとして返します
 */
function getGachaData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  var numCols = sheet.getLastColumn();
  var targetCols = Math.min(13, numCols);
  if (targetCols < 1) return [];

  var range = sheet.getRange(2, 1, lastRow - 1, targetCols);
  var values = range.getValues();
  var backgrounds = range.getBackgrounds();
  
  var data = [];
  for (var i = 0; i < values.length; i++) {
    var rowValues = [];
    for (var j = 0; j < values[i].length; j++) {
      var cellVal = values[i][j];
      if (cellVal instanceof Date) {
        rowValues.push(Utilities.formatDate(cellVal, Session.getScriptTimeZone(), "yyyy-MM-dd"));
      } else {
        rowValues.push(cellVal);
      }
    }

    while (rowValues.length < 13) {
      rowValues.push("");
    }
    
    var rowBackgrounds = backgrounds[i] || [];
    while (rowBackgrounds.length < 13) {
      rowBackgrounds.push("");
    }
    
    data.push({
      values: rowValues,
      backgrounds: rowBackgrounds
    });
  }
  return data;
}
