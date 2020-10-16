const JSDOM = require('jsdom').JSDOM;

const removeGarbageDOM = (htmlContent) => {
    let dom = new JSDOM(htmlContent);
    let document = dom.window.document;

    // remove bad imgs
    document.querySelectorAll('img[src*=".gif"]').forEach(node => { node.remove() })
    document.querySelectorAll('img[src*="admitad"]').forEach(node => { node.remove() })
    document.querySelectorAll('img[src*="tizer"]').forEach(node => { node.remove() })
    document.querySelectorAll('img[src*="placeholder"]').forEach(node => { node.remove() })

    // bad <p>
    let conditions = new RegExp(/\.com|\.ru|\.net|\.рф|\.club|\.info|\.org|Подробнее читайте|Читайте здесь|Больше информации здесь|Узнайте здесь|Редакция рекомендует|Похожие рецепты:|Подборки рецептов:|Сохраните себе|Источник:|Источники:|Список источников:|Полезные ссылки|Задать вопрос|Автор:|Авторы:|вернуться на главную|content|toc|В тренде|Полезно знать|подборка статей|на сайте|читать также|почитать в статье|прочитать в статье|Тизерная сеть|Будет интересно:|Будет полезно:|подписывайтесь|поделиться|подробнее в этой статье|Кстати, на нашем сайте|http|Рекомендуемые статьи|Статьи по теме|Автор публикации|Авторы|Понравилась статья|Также рекомендуем просмотреть|Похожие темы|Предыдущая запись|Следующая запись|Поделитесь страницей|Поделитесь статьей|Рекомендуем|Похожие материалы|Еще статьи|Заметили опечатку на сайте|комментировать|Написать комментарий|Главная страница|Поделитесь|Поделись|Если вы нашли ошибку, пожалуйста, выделите фрагмент текста|Enter|Смотрите ещё:|Смотрите также:|Также смотрите|Узнайте также:|Читайте также:|смотреть также|Подписаться|Редактировать статью|Поделись с друзьями|Что еще почитать|Добавить комментарий|Сохраните статью себе на страницу:|Присоединяйтесь к обсуждению:|Читайте нас|Поделились|вернуться к содержанию|Что еще почитать|Присоединяйтесь к обсуждению|Оцените:|Оценить:|Не забудьте поделиться с друзьями|комментари|Рубрика:|Рубрики:|Категории:|Категория:|Автор статьи|Авторы|обработку персональных данных|Рейтинг статьи|рейтинг:|Читайте так же:|Еще статьи|По теме|содержание статьи|содержание записи|Рекомендуем почитать|Оцените статью|оглавлени|похожие статьи|Рекомендуем вам еще:|Рекомендуем вам:|Рекомендуем еще:|Рекомендуем еще записи по теме:|к содержанию|Читать статью полностью|Читать полностью|Наверх|рекламная сеть|^содержание:|^Содержание|Оглавление|оглавление:|VKontakte|теги:|метки:|вконтакте|Твитнуть|Facebook|Twitter|Фейсбук|Мой мир|Telegram|Pinterest|whatsapp|загрузка|Загрузка|Нет комментариев|Добавить отзыв|Оставить комментарий|Одноклассники|rating|оценок, среднее|loading|это интересно|яндекс.дзен|яндекс.zen|back to menu|^к началу|^наверх|^к содержа|^к оглавле/, 'i');
    document.querySelectorAll('p').forEach(p => {
        if (p.textContent && (p.textContent.match(conditions) || p.textContent.match(/\(.*?(оценка|оценок|среднее|рейтинг).*?\)/i)))
            p.remove(p)
    });
    // bad textnodes
    document.querySelectorAll('*').forEach(node => {
        if (node.nodeName && node.nodeName === "#text") {
            if (node.nodeValue && (node.nodeValue.match(conditions) || node.nodeValue.match(/\(.*?(оценка|оценок|среднее|рейтинг).*?\)/i)))
                node.remove(node);
        }
    })

    // Remove list numbers from h2
    document.querySelectorAll('h2').forEach(h2 => {
        h2.outerHTML = h2.outerHTML.replace(/\d+[.)]?\s/, '');
    });

    // remove empty blockquotes
    document.querySelectorAll('blockquote').forEach(bq => {
        if (bq.textContent.trim().length === 0) {
            bq.remove(bq);
        }
    });

    let toReturn = document.querySelector('body').innerHTML;
    dom.window.close();
    document = null;
    dom = null;
    return toReturn;
}

module.exports = {
    cleanGarbage: (html) => {
        return removeGarbageDOM(html);
    },
    // Simply return textContent
    removeHtmlTags: (html) => {
        let dom = new JSDOM(html);
        return dom.window.document.documentElement.textContent;
    },
    insertMoreTag: (html) => {
        let dom = new JSDOM(html);
        let document = dom.window.document;

        let paragraphs = document.querySelectorAll('p');
        for (let p of paragraphs) {
            if (p.textContent && p.textContent.trim().length) {
                p.outerHTML = p.outerHTML + '<!--more-->';
                break;
            }
        }

        return document.querySelector('body').innerHTML;
    }
}