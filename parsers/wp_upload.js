// wp api upload article + imgs

const WPAPI = require('wpapi');
const fs = require('fs')
// const path = require('path')
const NodeSSH = require('node-ssh').NodeSSH
let ssh = new NodeSSH()
const rimraf = require("rimraf");
const axios = require('axios');
const qs = require('qs');
const { updateArticle } = require('../apiCalls');

const createCat = async (wp, name) => {
    try {
        const response = await wp.categories().create({
            name: name
        })
        return response.id;
    } catch (err) {
        if (err.data) {
            return err.data.term_id;
        } else {
            console.log(err);
            throw new Error('Category cannot be created');
        }
    }
}

const createPost = async (task, article, wp) => {
    try {
        
        let categoryId = await createCat(wp, article.category);

        let postObject = {
            // "title" and "content" are the only required properties
            title: article.title_h1,
            content: article.content_body,
            slug: article.slug,
            // Post will be created as a draft by default if a specific "status"
            // is not specified
            status: 'publish',
            categories: categoryId,
            meta: {
                '_aioseop_title': article.title_seo,
                '_aioseop_description': article.description_seo
            }
        };

        let testData = {
            title: 'Test',
            content: 'Content'
        }

        // let response = await axios({
        //     method: 'post', //you can set what request you want to be
        //     url: 'https://'+task.domain+'/wp-json/wp/v2/posts',
        //     data: qs.stringify(postObject),
        //     auth: {
        //         username: task.wp_user,
        //         password: task.wp_password
        //     }
        // })

        let response = await wp.posts().create(postObject);
        // console.log(response);
        return response;
    } catch (err) {
        console.log(err);
        return false;
    }

}

const uploadMedia = async (task, article, wp, wp_id) => {
    try {
        let connection = await ssh.connect({
            host: task.server_domain,
            port: 7248,
            username: task.ssh_user,
            password: task.ssh_password
        })
        
        const failed = []
        const successful = []
        let status = await connection.putDirectory('./tmp_images/' + task.domain + '/' + article.slug, 
            '/home/' + task.ssh_user + '/domains/' + task.domain + '/public_html/wp-content/uploads/posts/' + article.slug, 
            {
            recursive: true,
            concurrency: 5,
            // ^ WARNING: Not all servers support high concurrency
            // try a bunch of values and see what works on your server
            tick: function (localPath, remotePath, error) {
                if (error) {
                    failed.push(localPath)
                } else {
                    successful.push(localPath)
                }
            }
        })
        console.log('-- IMAGES DIR UPLOAD: ', status ? 'successful' : 'unsuccessful')
        if (!status) {
            console.log('failed transfers', failed.join(', '))
            console.log('successful transfers', successful.join(', '))
            throw new Error('files upload fail')
        }
        connection.dispose();
        ssh.dispose();
        // ssh = null;

        // upload featured image
        //'./tmp_images/' + task.domain + '/' + article.slug + '/' + article.slug + '_0.jpg'
        let media = await wp.media().file(successful[0]).create({
            title: article.keyword,
            post_id: wp_id
        }) 
        // console.log('media: ' + media)

        if (media.id) {
            let updatedPost = await wp.posts().id(wp_id).update({
                featured_media: media.id
            })

            if (!updatedPost.id) {
                throw new Error('Can\'t update featured image in post');
            } else {
                console.log('-- FEATURED IMG UPDATED')
            }
        } else {
            throw new Error('Can\'t create featured image');
        }

        // let files = await ssh.putFiles([{ local: './tmp_images/'+task.domain + '/' +article.slug, remote:  }]);
        return true;
    } catch (err) {
        console.log(err);
        return false;
    }

}

// ИСТОЧНИКИ
// сохранить источники блоков отдельно в массив, загнать их через апи.
// на сайте под каждым блоком сделать кнопку ИСТОЧНИК - по нажатию фетчить из мета нужную ссыль
// еще черный список незабыть для доменов и прочей шелухи для доноров

module.exports = {
    uploadArticle: async (task, article, exists = false) => {
        var wp = new WPAPI({
            endpoint: 'https://' + task.domain + '/wp-json',
            // This assumes you are using basic auth, as described further below
            username: task.wp_user,
            password: task.wp_password
        });

        try {
            let wp_id = 0;

            if (exists) {
                wp_id = article.wp_id;
                console.log('-- POST ALREADY EXISTS')
            } else {
                // create post
                let post = await createPost(task, article, wp);
                
                if (post.id) {
                    wp_id = post.id;
                    let artUpdated = await updateArticle(article.id , { wp_id: post.id, content_body: '', text_body: '' });
                    console.log('-- POST CREATED')
                } else {
                    // console.log(post);
                    throw new Error("Rest API returned error")
                }
            }

            // upload imgs
            if (article.imgsCount) {
                let mediaUploaded = await uploadMedia(task, article, wp, wp_id);

                if (mediaUploaded) {
                    await updateArticle(article.id, { is_uploaded: true });
                    rimraf.sync('./tmp_images/' + task.domain + '/' + article.slug);
                }
            } else {
                await updateArticle(article.id, { is_uploaded: true });
            }

            return true;
        } catch (err) {
            console.log(err)
            return false;
        }
    },
    articleExists: async (task, slug) => {
        var wp = new WPAPI({
            endpoint: 'https://' + task.domain + '/wp-json',
            // This assumes you are using basic auth, as described further below
            username: task.wp_user,
            password: task.wp_password
        });
        try {
            let response = await wp.posts().slug(slug);
            if (response.id) {
                return response.id;
            }
            return false;
        } catch(err) {
            console.log(err);
            throw new Error('Request [articleExists] failed');
        }


    }
}