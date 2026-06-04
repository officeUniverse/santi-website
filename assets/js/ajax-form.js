(function ($) {
    'use strict';

    var form = $('#contact__form'),
        message_box = $('.ajax-response'),
        form_data;

    function done_func(response) {
        message_box
            .removeClass('error-message')
            .addClass('success-message')
            .text(response)
            .fadeIn();
        setTimeout(function () {
            message_box.fadeOut(400, function () {
                $(this).removeClass('success-message');
            });
        }, 4000);
        form.find('input:not([type="submit"]), textarea').val('');
    }

    function fail_func(data) {
        var errText = data.responseText || 'Something went wrong. Please try again.';
        message_box
            .removeClass('success-message')
            .addClass('error-message')
            .text(errText)
            .fadeIn();
        setTimeout(function () {
            message_box.fadeOut(400, function () {
                $(this).removeClass('error-message');
            });
        }, 4000);
    }

    form.submit(function (e) {
        e.preventDefault();

        var name = ($('#full-name').val() || '').trim();
        var email = ($('#email').val() || '').trim();
        var subject = ($('#subject').val() || '').trim();
        var msg = ($('#message').val() || '').trim();

        if (!name || !email || !subject || !msg) {
            message_box
                .removeClass('success-message')
                .addClass('error-message')
                .text('Please fill in all required fields (Name, Email, Subject, Message).')
                .fadeIn();
            setTimeout(function () {
                message_box.fadeOut(400, function () {
                    $(this).removeClass('error-message');
                });
            }, 4000);
            return false;
        }

        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            message_box
                .removeClass('success-message')
                .addClass('error-message')
                .text('Please enter a valid email address.')
                .fadeIn();
            setTimeout(function () {
                message_box.fadeOut(400, function () {
                    $(this).removeClass('error-message');
                });
            }, 4000);
            return false;
        }

        form_data = $(this).serialize();

        form.find('[type="submit"]').prop('disabled', true).text('Sending...');

        $.ajax({
            type: 'POST',
            url: form.attr('action'),
            data: form_data
        })
            .done(done_func)
            .fail(fail_func)
            .always(function () {
                form.find('[type="submit"]').prop('disabled', false).html(
                    '<span class="btn-wrap"><span class="text-one">Submit now</span><span class="text-two">Submit now</span></span>'
                );
            });
    });

})(jQuery);