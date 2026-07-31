package ai.myaba.service;

import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Outbound transactional email (currently: org invitations) over SMTP.
 *
 * <p><b>Fail-graceful:</b> Spring only auto-configures a {@link JavaMailSender} when
 * {@code spring.mail.host} is set, so with no SMTP configured this service is DISABLED and
 * {@link #sendInviteEmail} throws a clear "not configured" error the caller surfaces to the
 * admin — never a silent no-op. Works with any SMTP provider (SendGrid, SES, Mailgun, …).
 */
@Service
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender; // null when SMTP isn't configured
    private final String mailHost;
    private final String fromAddress;
    private final String fromName;

    public EmailService(
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${spring.mail.host:}") String mailHost,
            @Value("${app.mail.from:no-reply@myaba.ai}") String fromAddress,
            @Value("${app.mail.from-name:myABA.ai}") String fromName) {
        this.mailSender  = mailSenderProvider.getIfAvailable();
        this.mailHost    = mailHost;
        this.fromAddress = fromAddress;
        this.fromName    = fromName;
    }

    /** True when an SMTP host is configured and a mail sender is available. */
    public boolean isEnabled() {
        return mailSender != null && mailHost != null && !mailHost.isBlank();
    }

    /**
     * Send an organization-invitation email with the single-use setup link.
     *
     * @throws IllegalStateException if email is not configured (surface this to the admin)
     * @throws Exception             on an SMTP send failure
     */
    public void sendInviteEmail(String to, String orgName, String roleLabel, String inviteUrl) throws Exception {
        if (!isEnabled()) {
            throw new IllegalStateException(
                    "Email is not configured on the server. Set MAIL_HOST / MAIL_USERNAME / MAIL_PASSWORD "
                    + "(SMTP), or copy the invite link and send it manually.");
        }
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
        helper.setFrom(fromAddress, fromName);
        helper.setTo(to);
        helper.setSubject("You're invited to " + safe(orgName, "your organization") + " on myABA.ai");
        helper.setText(buildHtml(orgName, roleLabel, inviteUrl), true);
        mailSender.send(message);
        log.info("Invite email sent to {}", to);
    }

    private String buildHtml(String orgName, String roleLabel, String inviteUrl) {
        String roleLine = (roleLabel == null || roleLabel.isBlank())
                ? "" : " as <strong>" + esc(roleLabel) + "</strong>";
        return "<div style=\"font-family:system-ui,sans-serif;font-size:15px;color:#1f2937;line-height:1.6\">"
                + "<p>You've been invited to join <strong>" + esc(safe(orgName, "your organization"))
                + "</strong> on myABA.ai" + roleLine + ".</p>"
                + "<p style=\"margin:20px 0\"><a href=\"" + esc(inviteUrl)
                + "\" style=\"display:inline-block;background:#2a5f6f;color:#ffffff;padding:11px 20px;"
                + "border-radius:8px;text-decoration:none;font-weight:600\">Set up your account</a></p>"
                + "<p style=\"font-size:13px;color:#6b7280\">Or paste this single-use link (expires in 7 days):<br>"
                + "<a href=\"" + esc(inviteUrl) + "\">" + esc(inviteUrl) + "</a></p></div>";
    }

    private static String safe(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
