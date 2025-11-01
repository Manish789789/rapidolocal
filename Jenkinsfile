pipeline {
    agent any
    environment {
        BUN_ENV_DEBUG_JSC_OPTIONS = '--max-old-space-size=8192'
        HOME = '/var/lib/jenkins'
        NODE_HOME = "${env.HOME}/.nvm/versions/node/v23.6.1/bin"
        PM2_HOME = "${env.HOME}/.pm2"
        BUN_INSTALL = "${env.HOME}/.bun"
        PATH = "${env.BUN_INSTALL}/bin:${NODE_HOME}:${env.PATH}" // Append BUN_INSTALL to PATH
        APP_NAME = 'rapidoride-backend'
        CUSTOM_WORKSPACE = "${env.HOME}/workspace/rapidoride-backend/${env.BRANCH_NAME}"
    }
    options {
        skipDefaultCheckout() // Skips default checkout to control workspace directory
    }
    stages {
        stage('Checkout') {
            steps {
                dir("${env.CUSTOM_WORKSPACE}") {
                    checkout scm
                }
            }
        }
        stage('Build and Deploy') {
            steps {
                dir("${env.CUSTOM_WORKSPACE}/") {
                    script {
                        // Get the current user
                        def username = sh(script: 'whoami', returnStdout: true).trim()
                        echo "The logged-in user is: ${username}"

                        // Install dependencies using bun
                        sh "${BUN_INSTALL}/bin/bun install"
                        def isAppRunning = sh(returnStatus: true, script: "pm2 describe ${APP_NAME} > /dev/null")
                        echo "Application is running"

                        if (isAppRunning == 0) {
                            echo "Application is running. Reloading..."
                            sh "nohup pm2 reload ${APP_NAME} --update-env"
                        } else {
                            echo "Starting the application for the first time..."
                            sh "nohup pm2 start --interpreter ~/.bun/bin/bun src/app.ts --name ${APP_NAME}"
                        }
 
                        // Save the PM2 process list
                        sh "pm2 save"

                        // List running PM2 processes
                        sh "pm2 list"

                        // Display the last 20 lines of logs for the app
                        echo "Fetching the last 20 lines of logs for the application:"
                        //sh "pm2 logs ${APP_NAME} --lines 20"
                       
                        echo "Build and application start/reload initiated successfully."
                    }
                }
            }
        }
    }
}
