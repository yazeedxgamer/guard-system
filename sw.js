// --- الكود الخاص باستقبال الإشعارات وعرضها ---

self.addEventListener('push', function(event) {
    // استلام البيانات المرسلة مع الإشعار
    const data = event.data.json();
    
    // تجهيز عنوان ونص الإشعار
    const title = data.title || 'رسالة جديدة من نظام اركانات';
    const options = {
        body: data.body,
        icon: 'icon-192.png', // أيقونة الإشعار الرئيسية
        badge: 'badge-72.png', // أيقونة صغيرة تظهر في شريط الحالة (للأندرويد)
        data: {
            url: data.url || '/' // رابط يتم فتحه عند الضغط على الإشعار
        }
    };

    // عرض الإشعار
    event.waitUntil(self.registration.showNotification(title, options));
});

// --- الكود الخاص بما يحدث عند الضغط على الإشعار ---
self.addEventListener('notificationclick', function(event) {
    // إغلاق الإشعار عند الضغط عليه
    event.notification.close();

    // فتح الرابط المرفق مع الإشعار (إذا وجد)
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});
