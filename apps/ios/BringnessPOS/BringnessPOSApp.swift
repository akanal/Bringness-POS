import SwiftUI
import WebKit

@main
struct BringnessPOSApp: App {
    var body: some Scene { WindowGroup { POSScreen() } }
}

final class POSBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    @Published var error: String?
    let webView: WKWebView
    let home = URL(string: "https://bringness.de/pos/")!
    private var downloads: [ObjectIdentifier: URL] = [:]
    private let hosts = ["bringness.de", "www.bringness.de", "bringness-pos.de", "www.bringness-pos.de"]
    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        load()
    }
    func load() { error = nil; webView.load(URLRequest(url: home)) }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { error = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError failure: Error) {
        if (failure as NSError).code != NSURLErrorCancelled { error = "Die Kasse ist nicht erreichbar. Bitte die Internetverbindung prüfen." }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError failure: Error) {
        if (failure as NSError).code != NSURLErrorCancelled { error = "Die Seite konnte nicht geladen werden." }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "blob", hosts.contains(action.sourceFrame.securityOrigin.host),
           hosts.contains(URL(string: String(url.absoluteString.dropFirst(5)))?.host ?? "") {
            decisionHandler(.download); return
        }
        guard url.scheme == "https" else { decisionHandler(.cancel); return }
        if hosts.contains(url.host ?? "") {
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated || action.targetFrame?.isMainFrame == true { UIApplication.shared.open(url) }
        }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        else if let url = action.request.url, url.scheme == "blob", hosts.contains(action.sourceFrame.securityOrigin.host) { webView.load(action.request) }
        return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let filename = (suggestedFilename as NSString).lastPathComponent
            let url = directory.appendingPathComponent((filename.isEmpty || filename == "." || filename == "..") ? "Bringness-Beleg.pdf" : filename)
            downloads[ObjectIdentifier(download)] = url
            completionHandler(url)
        } catch { self.error = "Der Beleg konnte nicht gespeichert werden."; completionHandler(nil) }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)), let controller = presenter() else { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = controller.view
        share.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
        share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        controller.present(share, animated: true)
    }
    func download(_ download: WKDownload, didFailWithError failure: Error, resumeData: Data?) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        error = "Der Download ist fehlgeschlagen. Bitte erneut versuchen."
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.protocol == "https" && hosts.contains(origin.host) ? .prompt : .deny)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        present(message: message, confirm: false) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        present(message: message, confirm: true, completion: completionHandler)
    }
    private func present(message: String, confirm: Bool, completion: @escaping (Bool) -> Void) {
        guard let controller = presenter() else { completion(false); return }
        let alert = UIAlertController(title: "Bringness POS", message: message, preferredStyle: .alert)
        if confirm { alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completion(false) }) }
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion(true) })
        controller.present(alert, animated: true)
    }
    private func presenter() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
              var controller = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { return nil }
        while let next = controller.presentedViewController { controller = next }
        return controller
    }
}

struct POSWebView: UIViewRepresentable {
    let browser: POSBrowser
    func makeUIView(context: Context) -> WKWebView { browser.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

struct POSScreen: View {
    @StateObject private var browser = POSBrowser()
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Bringness POS").font(.headline)
                Spacer()
                Button("Kasse") { browser.load() }
                Button("Neu laden") { browser.webView.reload() }
            }.padding().background(Color(red: 0.03, green: 0.09, blue: 0.17)).foregroundColor(.white)
            if let error = browser.error {
                VStack(spacing: 16) { Text(error); Button("Erneut versuchen") { browser.load() } }.padding()
            } else { POSWebView(browser: browser) }
        }.tint(Color(red: 1, green: 0.46, blue: 0.16))
    }
}
